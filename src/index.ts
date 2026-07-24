// HelpDesk Worker — jádro v0.1 (verify-core: issue + vláknové zprávy + stavy + e-mail).
// Rozšíření (Gantt/Kanban/KPI/AI/rozpočet) se nabalují na tuhle kostru.

import { Env, STATUS, TRANSITIONS, Status } from "./types";

export { TicketRoom } from "./do";

// ── helpers ────────────────────────────────────────────────────────────────
const now = () => Math.floor(Date.now() / 1000);
const uuid = () => crypto.randomUUID();
const domainOf = (email: string) => (email.split("@")[1] || "").toLowerCase();

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** Append-only audit (v1 jen změny). */
async function audit(
  env: Env,
  actor: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  before: unknown,
  after: unknown,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_log (id, at, actor_id, action, entity_type, entity_id, before, after)
     VALUES (?,?,?,?,?,?,?,?)`,
  )
    .bind(
      uuid(),
      now(),
      actor,
      action,
      entityType,
      entityId,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
    )
    .run();
}

/** Token firmy → záznam company (bootstrap admina, izolace dat). */
async function authCompany(env: Env, req: Request): Promise<any | null> {
  const token = req.headers.get("x-helpdesk-token");
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT * FROM company WHERE token = ? AND (token_expires IS NULL OR token_expires > ?)`,
  )
    .bind(token, now())
    .first();
  return row || null;
}

/** TODO: e-mail notifikace přes Cloudflare Email Routing / MailChannels. Zatím stub. */
async function notify(_env: Env, event: string, payload: Record<string, unknown>): Promise<void> {
  console.log("notify", event, JSON.stringify(payload));
}

// ── handlery ───────────────────────────────────────────────────────────────
async function listTickets(env: Env, company: any, url: URL): Promise<Response> {
  const project = url.searchParams.get("project");
  const sql = project
    ? `SELECT i.* FROM issue i JOIN project p ON p.id = i.project_id
       WHERE p.company_id = ? AND i.project_id = ? ORDER BY i.created_at DESC LIMIT 200`
    : `SELECT i.* FROM issue i JOIN project p ON p.id = i.project_id
       WHERE p.company_id = ? ORDER BY i.created_at DESC LIMIT 200`;
  const stmt = project
    ? env.DB.prepare(sql).bind(company.id, project)
    : env.DB.prepare(sql).bind(company.id);
  const { results } = await stmt.all();
  return json({ tickets: results });
}

async function listProjects(env: Env, company: any): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, name, manager_id, max_depth, default_visibility FROM project
     WHERE company_id = ? ORDER BY name`,
  )
    .bind(company.id)
    .all();
  return json({ projects: results });
}

async function createTicket(env: Env, company: any, req: Request): Promise<Response> {
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  if (!b.project_id || !b.title) return json({ error: "project_id a title jsou povinné" }, 400);

  // úkol vždy pod projektem téže firmy
  const proj = await env.DB.prepare(`SELECT * FROM project WHERE id = ? AND company_id = ?`)
    .bind(b.project_id, company.id)
    .first();
  if (!proj) return json({ error: "projekt nenalezen" }, 404);

  // hloubka z rodiče (epic/nadřazený úkol); respektuj max_depth projektu
  let depth = 0;
  if (b.parent_id) {
    const parent = await env.DB.prepare(`SELECT depth, project_id FROM issue WHERE id = ?`)
      .bind(b.parent_id)
      .first<{ depth: number; project_id: string }>();
    if (!parent || parent.project_id !== b.project_id)
      return json({ error: "neplatný parent_id" }, 400);
    depth = parent.depth + 1;
    if (depth > (proj as any).max_depth) return json({ error: "překročena max. hloubka" }, 400);
  }

  const numRow = await env.DB.prepare(
    `SELECT COALESCE(MAX(number), 0) + 1 AS n FROM issue i
     JOIN project p ON p.id = i.project_id WHERE p.company_id = ?`,
  )
    .bind(company.id)
    .first<{ n: number }>();

  const id = uuid();
  const t = now();
  await env.DB.prepare(
    `INSERT INTO issue
      (id, number, parent_id, project_id, type, depth, title, description, request_type,
       status, product_line, functional_area, importance, urgency, priority, internal,
       assignee_id, author_id, estimate_hours, requested_realization, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      id,
      numRow?.n ?? 1,
      b.parent_id ?? null,
      b.project_id,
      b.type ?? "task",
      depth,
      b.title,
      b.description ?? null,
      b.request_type ?? "request",
      "new",
      b.product_line ?? null,
      b.functional_area ?? null,
      b.importance ?? null,
      b.urgency ?? null,
      b.priority ?? null, // Extended mód; v Easy módu doplní AI triage
      b.internal ? 1 : 0,
      b.assignee_id ?? null,
      b.author_id ?? null,
      b.estimate_hours ?? null,
      b.requested_realization ?? null,
      t,
      t,
    )
    .run();

  await audit(env, b.author_id ?? null, "issue.create", "issue", id, null, { title: b.title });
  await notify(env, "ticket.created", { id, title: b.title });
  return json({ id, number: numRow?.n ?? 1, status: "new" }, 201);
}

async function getTicket(env: Env, company: any, id: string): Promise<Response> {
  const issue = await env.DB.prepare(
    `SELECT i.* FROM issue i JOIN project p ON p.id = i.project_id
     WHERE i.id = ? AND p.company_id = ?`,
  )
    .bind(id, company.id)
    .first();
  if (!issue) return json({ error: "ticket nenalezen" }, 404);
  const { results: messages } = await env.DB.prepare(
    `SELECT * FROM message WHERE issue_id = ? ORDER BY created_at ASC`,
  )
    .bind(id)
    .all();
  return json({ issue, messages });
}

async function addMessage(env: Env, company: any, id: string, req: Request): Promise<Response> {
  const issue = await env.DB.prepare(
    `SELECT i.* FROM issue i JOIN project p ON p.id = i.project_id
     WHERE i.id = ? AND p.company_id = ?`,
  )
    .bind(id, company.id)
    .first();
  if (!issue) return json({ error: "ticket nenalezen" }, 404);

  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  let authorDomain: string | null = null;
  if (b.author_id) {
    const u = await env.DB.prepare(`SELECT email FROM user WHERE id = ?`)
      .bind(b.author_id)
      .first<{ email: string }>();
    if (u) authorDomain = domainOf(u.email);
  }

  const mid = uuid();
  await env.DB.prepare(
    `INSERT INTO message
      (id, issue_id, parent_id, author_id, author_domain, visibility, body_html,
       high_priority, accepts_solution, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      mid,
      id,
      b.parent_id ?? null,
      b.author_id ?? null,
      authorDomain,
      b.visibility === "internal" ? "internal" : "shared",
      b.body_html ?? "",
      b.high_priority ? 1 : 0,
      b.accepts_solution ? 1 : 0,
      now(),
    )
    .run();

  await audit(env, b.author_id ?? null, "message.add", "message", mid, null, {
    issue_id: id,
    visibility: b.visibility ?? "shared",
  });

  // Checkbox „akceptuji řešení" → přechod na accepted (když je povolený)
  if (b.accepts_solution && TRANSITIONS[(issue as any).status as Status]?.includes("accepted")) {
    await changeStatusInternal(env, id, "accepted", b.author_id ?? null, (issue as any).status);
  }

  await notify(env, "message.added", { issue_id: id, message_id: mid });
  // živý update do místnosti ticketu
  env.TICKET.get(env.TICKET.idFromName(id)).fetch("https://do/broadcast", {
    method: "POST",
    body: JSON.stringify({ type: "message", id: mid }),
  }).catch(() => {});
  return json({ id: mid }, 201);
}

async function changeStatusInternal(
  env: Env,
  id: string,
  to: Status,
  actor: string | null,
  from: string,
): Promise<void> {
  await env.DB.prepare(`UPDATE issue SET status = ?, updated_at = ? WHERE id = ?`)
    .bind(to, now(), id)
    .run();
  await audit(env, actor, "issue.status", "issue", id, { status: from }, { status: to });
  await notify(env, "status.changed", { issue_id: id, from, to });
}

async function changeStatus(env: Env, company: any, id: string, req: Request): Promise<Response> {
  const issue = await env.DB.prepare(
    `SELECT i.* FROM issue i JOIN project p ON p.id = i.project_id
     WHERE i.id = ? AND p.company_id = ?`,
  )
    .bind(id, company.id)
    .first();
  if (!issue) return json({ error: "ticket nenalezen" }, 404);

  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  const from = (issue as any).status as Status;
  const to = b.to as Status;
  if (!TRANSITIONS[from] || !TRANSITIONS[from].includes(to))
    return json({ error: `přechod ${from} → ${to} není povolen` }, 400);

  await changeStatusInternal(env, id, to, b.actor_id ?? null, from);
  return json({ id, status: to });
}

// ── router ─────────────────────────────────────────────────────────────────
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;

    if (p === "/api/health") {
      return json({ ok: true, service: "helpdesk", version: "0.1.0", ai: env.AI_PROVIDER });
    }

    if (p.startsWith("/api/")) {
      // živý kanál ticketu (WebSocket) → Durable Object
      const live = p.match(/^\/api\/tickets\/([^/]+)\/live$/);
      if (live) {
        return env.TICKET.get(env.TICKET.idFromName(live[1])).fetch(req);
      }

      const company = await authCompany(env, req);
      if (!company) return json({ error: "neplatný nebo chybějící token firmy" }, 401);

      try {
        if (p === "/api/projects" && req.method === "GET") return await listProjects(env, company);
        if (p === "/api/meta" && req.method === "GET")
          return json({
            statuses: STATUS,
            transitions: TRANSITIONS,
            priorities: ["blocking", "critical", "high", "low"],
            request_types: ["request", "complaint"],
          });
        if (p === "/api/tickets" && req.method === "GET") return await listTickets(env, company, url);
        if (p === "/api/tickets" && req.method === "POST") return await createTicket(env, company, req);

        const m = p.match(/^\/api\/tickets\/([^/]+)(\/messages|\/status)?$/);
        if (m) {
          const id = m[1];
          if (!m[2] && req.method === "GET") return await getTicket(env, company, id);
          if (m[2] === "/messages" && req.method === "POST") return await addMessage(env, company, id, req);
          if (m[2] === "/status" && req.method === "POST") return await changeStatus(env, company, id, req);
        }
      } catch (e: any) {
        return json({ error: "server", detail: String(e?.message ?? e) }, 500);
      }
      return json({ error: "not found" }, 404);
    }

    // vše ostatní = statické SPA
    return env.ASSETS.fetch(req);
  },
};
