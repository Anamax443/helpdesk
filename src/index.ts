// HelpDesk Worker — jádro v0.1 (verify-core: issue + vláknové zprávy + stavy + e-mail).
// Rozšíření (Gantt/Kanban/KPI/AI/rozpočet) se nabalují na tuhle kostru.

import { Env, STATUS, TRANSITIONS, Status } from "./types";
import { enforceRetention } from "./retention";

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
    ? `SELECT i.*, (COALESCE(p.key, UPPER(SUBSTR(p.name, 1, 3))) || '-' || i.number) AS ticket_key FROM issue i JOIN project p ON p.id = i.project_id
       WHERE p.company_id = ? AND i.project_id = ? ORDER BY i.created_at DESC LIMIT 200`
    : `SELECT i.*, (COALESCE(p.key, UPPER(SUBSTR(p.name, 1, 3))) || '-' || i.number) AS ticket_key FROM issue i JOIN project p ON p.id = i.project_id
       WHERE p.company_id = ? ORDER BY i.created_at DESC LIMIT 200`;
  const stmt = project
    ? env.DB.prepare(sql).bind(company.id, project)
    : env.DB.prepare(sql).bind(company.id);
  const { results } = await stmt.all();
  return json({ tickets: results });
}

async function listProjects(env: Env, company: any): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, name, key, manager_id, max_depth, default_visibility FROM project
     WHERE company_id = ? ORDER BY name`,
  )
    .bind(company.id)
    .all();
  return json({ projects: results });
}

function normKey(s: string): string {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}
async function createProject(env: Env, company: any, req: Request): Promise<Response> {
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  if (!b.name) return json({ error: "název je povinný" }, 400);
  const id = uuid();
  const key = normKey(b.key || b.name.slice(0, 3)) || "PRJ";
  await env.DB.prepare(
    `INSERT INTO project (id, company_id, name, key, max_depth, default_visibility, created_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).bind(id, company.id, b.name, key, Number(b.max_depth) || 5,
    b.default_visibility === "internal" ? "internal" : "shared", now()).run();
  await audit(env, null, "project.create", "project", id, null, { name: b.name, key });
  return json({ id, name: b.name, key }, 201);
}
async function updateProject(env: Env, company: any, id: string, req: Request): Promise<Response> {
  const pr = await env.DB.prepare(`SELECT id FROM project WHERE id = ? AND company_id = ?`).bind(id, company.id).first();
  if (!pr) return json({ error: "projekt nenalezen" }, 404);
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  const key = b.key ? normKey(b.key) : null;
  await env.DB.prepare(
    `UPDATE project SET name = COALESCE(?, name), key = COALESCE(?, key),
       max_depth = COALESCE(?, max_depth), default_visibility = COALESCE(?, default_visibility) WHERE id = ?`,
  ).bind(b.name ?? null, key, b.max_depth != null ? Number(b.max_depth) : null, b.default_visibility ?? null, id).run();
  await audit(env, null, "project.update", "project", id, null, b);
  return json({ id, ok: true });
}

async function listRetention(env: Env, company: any): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT category, months, action FROM retention_policy WHERE company_id = ? ORDER BY category`,
  ).bind(company.id).all();
  return json({ policies: results });
}

async function setRetention(env: Env, company: any, req: Request): Promise<Response> {
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  const cats = ["closed_tickets", "audit_log", "attachments", "inactive_users"];
  if (!cats.includes(b.category)) return json({ error: "neplatná kategorie" }, 400);
  const action = b.action === "delete" ? "delete" : "anonymize";
  const months = b.months == null || b.months === "" ? null : parseInt(String(b.months), 10);
  await env.DB.prepare(
    `INSERT INTO retention_policy (id, company_id, category, months, action, created_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(company_id, category) DO UPDATE SET months = excluded.months, action = excluded.action`,
  ).bind(uuid(), company.id, b.category, months, action, now()).run();
  await audit(env, null, "retention.set", "company", company.id, null, { category: b.category, months, action });
  return json({ ok: true, category: b.category, months, action });
}

async function setHold(env: Env, company: any, id: string, req: Request): Promise<Response> {
  const issue = await env.DB.prepare(
    `SELECT i.legal_hold FROM issue i JOIN project p ON p.id = i.project_id WHERE i.id = ? AND p.company_id = ?`,
  ).bind(id, company.id).first<{ legal_hold: number }>();
  if (!issue) return json({ error: "ticket nenalezen" }, 404);
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  const hold = b.hold ? 1 : 0;
  await env.DB.prepare(`UPDATE issue SET legal_hold = ? WHERE id = ?`).bind(hold, id).run();
  await audit(env, b.actor_id ?? null, "issue.legal_hold", "issue", id, { legal_hold: issue.legal_hold }, { legal_hold: hold });
  return json({ id, legal_hold: hold });
}

// ── admin (provider) ─────────────────────────────────────────────────────────
function genToken(): string {
  const b = new Uint8Array(15);
  crypto.getRandomValues(b);
  const s = btoa(String.fromCharCode(...b)).replace(/[+/=]/g, "");
  return "hd_" + s;
}

/** Expirace tokenu: expires_at (konkrétní datum ISO / timestamp) má přednost před expires_days (relativní). */
function parseExpiry(b: Record<string, any>): number | null {
  if (b.expires_at != null && b.expires_at !== "") {
    const s = String(b.expires_at);
    const ms = s.length <= 10 ? Date.parse(s + "T23:59:59Z") : Date.parse(s);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
  }
  if (b.expires_days != null && b.expires_days !== "") return now() + Number(b.expires_days) * 86400;
  return null;
}

/** Prostředí odvozené z tokenu — sem přibude případné další (rozšiřitelné). */
function envForCompany(company: any): string {
  return company.is_provider === 1 ? "admin" : "user";
}

async function listCompanies(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.name, c.token, c.token_expires, c.is_provider, c.recovery_email, c.created_at,
       (SELECT COUNT(*) FROM project p WHERE p.company_id = c.id) AS projects
     FROM company c ORDER BY c.is_provider DESC, c.name`,
  ).all();
  return json({ companies: results });
}

async function createCompany(env: Env, req: Request): Promise<Response> {
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  if (!b.name) return json({ error: "název je povinný" }, 400);
  const id = uuid();
  const token = genToken();
  const expires = parseExpiry(b);
  await env.DB.prepare(
    `INSERT INTO company (id, name, token, token_expires, is_provider, default_language, recovery_email, created_at)
     VALUES (?,?,?,?,0,'cs',?,?)`,
  ).bind(id, b.name, token, expires, b.recovery_email || null, now()).run();
  await audit(env, null, "company.create", "company", id, null, { name: b.name });
  return json({ id, name: b.name, token, token_expires: expires }, 201);
}

async function setCompanyToken(env: Env, id: string, req: Request): Promise<Response> {
  const c = await env.DB.prepare(`SELECT id, is_provider FROM company WHERE id = ?`)
    .bind(id).first<{ id: string; is_provider: number }>();
  if (!c) return json({ error: "firma nenalezena" }, 404);
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  // Provider (admin) token NESMI expirovat, dokud neni obnova pres overeny e-mail.
  const expires = c.is_provider === 1 ? null : parseExpiry(b);
  if (b.recovery_email !== undefined) {
    await env.DB.prepare(`UPDATE company SET recovery_email = ? WHERE id = ?`).bind(b.recovery_email || null, id).run();
  }
  let token: string | null = null;
  if (b.regenerate) {
    token = genToken();
    await env.DB.prepare(`UPDATE company SET token = ?, token_expires = ? WHERE id = ?`).bind(token, expires, id).run();
  } else {
    await env.DB.prepare(`UPDATE company SET token_expires = ? WHERE id = ?`).bind(expires, id).run();
  }
  await audit(env, null, "company.token", "company", id, null, { regenerate: !!b.regenerate, token_expires: expires });
  return json({ id, token, token_expires: expires });
}

async function revokeCompany(env: Env, id: string): Promise<Response> {
  await env.DB.prepare(`UPDATE company SET token_expires = ? WHERE id = ?`).bind(now() - 1, id).run();
  await audit(env, null, "company.revoke", "company", id, null, null);
  return json({ id, revoked: true });
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
    `SELECT COALESCE(MAX(number), 0) + 1 AS n FROM issue WHERE project_id = ?`,
  )
    .bind(b.project_id)
    .first<{ n: number }>();
  const num = numRow?.n ?? 1;

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
      num,
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

  const pkey = String((proj as any).key || (proj as any).name.slice(0, 3)).toUpperCase();
  await audit(env, b.author_id ?? null, "issue.create", "issue", id, null, { title: b.title });
  await notify(env, "ticket.created", { id, title: b.title });
  return json({ id, number: num, key: pkey + "-" + num, status: "new" }, 201);
}

async function getTicket(env: Env, company: any, id: string): Promise<Response> {
  const issue = await env.DB.prepare(
    `SELECT i.*, (COALESCE(p.key, UPPER(SUBSTR(p.name, 1, 3))) || '-' || i.number) AS ticket_key FROM issue i JOIN project p ON p.id = i.project_id
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
    `SELECT i.*, (COALESCE(p.key, UPPER(SUBSTR(p.name, 1, 3))) || '-' || i.number) AS ticket_key FROM issue i JOIN project p ON p.id = i.project_id
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
    `SELECT i.*, (COALESCE(p.key, UPPER(SUBSTR(p.name, 1, 3))) || '-' || i.number) AS ticket_key FROM issue i JOIN project p ON p.id = i.project_id
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
        if (p === "/api/projects" && req.method === "POST") return await createProject(env, company, req);
        const pm = p.match(/^\/api\/projects\/([^/]+)$/);
        if (pm && req.method === "POST") return await updateProject(env, company, pm[1], req);
        if (p === "/api/meta" && req.method === "GET")
          return json({
            statuses: STATUS,
            transitions: TRANSITIONS,
            priorities: ["blocking", "critical", "high", "low"],
            request_types: ["request", "complaint"],
          });
        if (p === "/api/retention" && req.method === "GET") return await listRetention(env, company);
        if (p === "/api/retention" && req.method === "POST") return await setRetention(env, company, req);

        // kdo jsem + kam patřím (routing prostředí podle tokenu)
        if (p === "/api/me" && req.method === "GET")
          return json({ id: company.id, name: company.name, is_provider: company.is_provider, env: envForCompany(company) });

        // admin API — jen provider (is_provider=1)
        if (p.startsWith("/api/admin/")) {
          if (company.is_provider !== 1) return json({ error: "jen provider-admin" }, 403);
          if (p === "/api/admin/companies" && req.method === "GET") return await listCompanies(env);
          if (p === "/api/admin/companies" && req.method === "POST") return await createCompany(env, req);
          const am = p.match(/^\/api\/admin\/companies\/([^/]+)(\/token|\/revoke)$/);
          if (am && req.method === "POST") {
            if (am[2] === "/token") return await setCompanyToken(env, am[1], req);
            if (am[2] === "/revoke") return await revokeCompany(env, am[1]);
          }
        }

        if (p === "/api/tickets" && req.method === "GET") return await listTickets(env, company, url);
        if (p === "/api/tickets" && req.method === "POST") return await createTicket(env, company, req);

        const m = p.match(/^\/api\/tickets\/([^/]+)(\/messages|\/status|\/hold)?$/);
        if (m) {
          const id = m[1];
          if (!m[2] && req.method === "GET") return await getTicket(env, company, id);
          if (m[2] === "/messages" && req.method === "POST") return await addMessage(env, company, id, req);
          if (m[2] === "/status" && req.method === "POST") return await changeStatus(env, company, id, req);
          if (m[2] === "/hold" && req.method === "POST") return await setHold(env, company, id, req);
        }
      } catch (e: any) {
        return json({ error: "server", detail: String(e?.message ?? e) }, 500);
      }
      return json({ error: "not found" }, 404);
    }

    // vše ostatní = statické SPA
    return env.ASSETS.fetch(req);
  },

  // Naplánované vynucení retenční politiky (GDPR) — viz wrangler.jsonc triggers.crons.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(enforceRetention(env).then((r) => console.log("retention", JSON.stringify(r))));
  },
};
