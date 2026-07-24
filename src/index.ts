// HelpDesk Worker — jádro v0.1 (verify-core: issue + vláknové zprávy + stavy + e-mail).
// Rozšíření (Gantt/Kanban/KPI/AI/rozpočet) se nabalují na tuhle kostru.

import { Env, STATUS, TRANSITIONS, Status } from "./types";
import { enforceRetention } from "./retention";
import { VERSION } from "./version";
import { signInvite, verifyInvite } from "./token";

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
// Samostatné uložení e-mailu admina (netýká se tokenu ani expirace).
async function setCompanyEmail(env: Env, id: string, req: Request): Promise<Response> {
  const c = await env.DB.prepare(`SELECT id FROM company WHERE id = ?`).bind(id).first();
  if (!c) return json({ error: "firma nenalezena" }, 404);
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  const email = (b.email || "").toString().trim() || null;
  await env.DB.prepare(`UPDATE company SET recovery_email = ? WHERE id = ?`).bind(email, id).run();
  await audit(env, null, "company.email", "company", id, null, { recovery_email: email });
  return json({ id, recovery_email: email });
}

// ── kontakty + pozvánky ──────────────────────────────────────────────────────
async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
  return "pbkdf2$100000$" + b64(salt) + "$" + b64(new Uint8Array(bits));
}

async function listContacts(env: Env, company: any): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.active,
       (SELECT m.role FROM membership m WHERE m.user_id = u.id AND m.scope_type = 'company' AND m.scope_id = ? LIMIT 1) AS role
     FROM user u WHERE u.company_id = ? ORDER BY u.last_name, u.first_name`,
  ).bind(company.id, company.id).all();
  return json({ contacts: results });
}

async function createInvitation(env: Env, company: any, req: Request): Promise<Response> {
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  if (!b.email) return json({ error: "e-mail je povinný" }, 400);
  const role = b.role || "contact";
  const scope_type = b.scope_type || "company";
  const scope_id = b.scope_id || company.id;
  const exp = now() + 14 * 86400;
  const token = await signInvite({ email: b.email, scope_type, scope_id, roles: role, exp }, env.INVITE_SECRET);
  const id = uuid();
  await env.DB.prepare(
    `INSERT INTO invitation (id, email, scope_type, scope_id, roles, token, expires_at, status, invited_by, created_at)
     VALUES (?,?,?,?,?,?,?,'pending',?,?)`,
  ).bind(id, b.email, scope_type, scope_id, role, token, exp, company.id, now()).run();
  await audit(env, null, "invitation.create", "invitation", id, null, { email: b.email, role, scope_type });
  const acceptUrl = env.PUBLIC_BASE_URL + "/?invite=" + encodeURIComponent(token);
  // TODO: odeslat pozvánku e-mailem (env.EMAIL) až bude Email Sending zapnuté; zatím vrací odkaz ke zkopírování.
  await notify(env, "invitation.created", { email: b.email, acceptUrl });
  return json({ id, email: b.email, accept_url: acceptUrl }, 201);
}

// veřejné (bez tokenu firmy) — příjemce pozvánky
async function getInvite(env: Env, token: string): Promise<Response> {
  const p = await verifyInvite(token, env.INVITE_SECRET, now());
  if (!p) return json({ error: "neplatná nebo prošlá pozvánka" }, 400);
  let companyName = "";
  if (p.scope_type === "company") {
    const c = await env.DB.prepare(`SELECT name FROM company WHERE id = ?`).bind(p.scope_id).first<{ name: string }>();
    companyName = c?.name || "";
  } else if (p.scope_type === "project") {
    const c = await env.DB.prepare(`SELECT co.name FROM project p JOIN company co ON co.id = p.company_id WHERE p.id = ?`).bind(p.scope_id).first<{ name: string }>();
    companyName = c?.name || "";
  }
  return json({ email: p.email, scope_type: p.scope_type, roles: p.roles, company: companyName });
}

async function acceptInvite(env: Env, req: Request): Promise<Response> {
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  const p = await verifyInvite(b.token || "", env.INVITE_SECRET, now());
  if (!p) return json({ error: "neplatná nebo prošlá pozvánka" }, 400);
  let companyId: string = p.scope_id;
  if (p.scope_type === "project") {
    const row = await env.DB.prepare(`SELECT company_id FROM project WHERE id = ?`).bind(p.scope_id).first<{ company_id: string }>();
    if (!row) return json({ error: "cíl pozvánky neexistuje" }, 400);
    companyId = row.company_id;
  } else if (p.scope_type === "issue") {
    const row = await env.DB.prepare(`SELECT pr.company_id FROM issue i JOIN project pr ON pr.id = i.project_id WHERE i.id = ?`).bind(p.scope_id).first<{ company_id: string }>();
    if (!row) return json({ error: "cíl pozvánky neexistuje" }, 400);
    companyId = row.company_id;
  }
  const domain = (p.email.split("@")[1] || "").toLowerCase();
  let user = await env.DB.prepare(`SELECT id FROM user WHERE email = ?`).bind(p.email).first<{ id: string }>();
  let userId: string;
  if (user) {
    userId = user.id;
  } else {
    userId = uuid();
    const pwHash = b.password ? await hashPassword(String(b.password)) : null;
    await env.DB.prepare(
      `INSERT INTO user (id, company_id, email, domain, first_name, last_name, password_hash, active, created_at)
       VALUES (?,?,?,?,?,?,?,1,?)`,
    ).bind(userId, companyId, p.email, domain, b.first_name || null, b.last_name || null, pwHash, now()).run();
  }
  await env.DB.prepare(
    `INSERT INTO membership (id, user_id, scope_type, scope_id, role, party, created_at) VALUES (?,?,?,?,?,?,?)`,
  ).bind(uuid(), userId, p.scope_type, p.scope_id, p.roles, domain, now()).run();
  await env.DB.prepare(`UPDATE invitation SET status = 'accepted' WHERE token = ?`).bind(b.token).run();
  await audit(env, userId, "invitation.accept", "user", userId, null, { email: p.email, role: p.roles });
  return json({ ok: true, email: p.email });
}

// ── audit log (živý terminál + filtrovatelná historie) ──────────────────────
async function getAuditLog(env: Env, url: URL): Promise<Response> {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "40", 10) || 40, 1), 300);
  const action = (url.searchParams.get("action") || "").trim();
  const entity = (url.searchParams.get("entity") || "").trim();
  const where: string[] = [];
  const binds: any[] = [];
  if (action) { where.push("action LIKE ?"); binds.push("%" + action + "%"); }
  if (entity) { where.push("entity_type = ?"); binds.push(entity); }
  const sql = `SELECT id, at, actor_id, action, entity_type, entity_id FROM audit_log
    ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY at DESC LIMIT ?`;
  binds.push(limit);
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json({ events: results });
}

async function getKpi(env: Env): Promise<Response> {
  const OPEN = "('open','customer_collab','in_progress','waiting_deploy','third_party','on_hold','offer_sent')";
  const CLOSED = "('closed_invoiced','closed_not_invoiced','accepted')";
  const r: any = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM issue) AS total,
       (SELECT COUNT(*) FROM issue WHERE status = 'new') AS novy,
       (SELECT COUNT(*) FROM issue WHERE status IN ${OPEN}) AS otevrene,
       (SELECT COUNT(*) FROM issue WHERE status IN ${CLOSED}) AS uzavrene,
       (SELECT COUNT(*) FROM issue WHERE sla_breached = 1 AND status NOT IN ${CLOSED}) AS sla_breach,
       (SELECT COUNT(*) FROM issue WHERE priority = 'blocking' AND status NOT IN ${CLOSED}) AS blokacni,
       (SELECT COUNT(*) FROM issue WHERE status IN ${OPEN} AND assignee_id IS NULL) AS neprirazene,
       (SELECT COUNT(*) FROM company) AS firmy,
       (SELECT COUNT(*) FROM user) AS uzivatele,
       (SELECT COUNT(*) FROM project) AS projekty`,
  ).first();
  return json({ kpi: r });
}

// ── admin terminál (příkazy — read-only) ─────────────────────────────────────
function termTable(rows: any[]): string {
  if (!rows || !rows.length) return "(0 řádků)";
  const cols = Object.keys(rows[0]);
  const head = cols.join(" | ");
  const body = rows.map((r) => cols.map((c) => String(r[c] ?? "")).join(" | ")).join("\n");
  return head + "\n" + "-".repeat(Math.min(head.length, 90)) + "\n" + body;
}
async function adminTerminal(env: Env, req: Request): Promise<Response> {
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  const cmd = String(b.cmd || "").trim();
  const parts = cmd.split(/\s+/);
  const c = (parts[0] || "").toLowerCase();
  const HELP = [
    "Příkazy:",
    "  help                tato nápověda",
    "  stats               počty (firmy, uživatelé, projekty, tickety, zprávy)",
    "  companies           seznam firem",
    "  projects            seznam projektů",
    "  audit [n]           posledních n záznamů auditu (default 20, max 100)",
    "  sql <SELECT ...>    read-only SQL dotaz nad D1 (jen SELECT, bez ;)",
    "  clear               vyčistit terminál",
  ].join("\n");
  try {
    if (!c) return json({ output: "" });
    if (c === "help" || c === "?") return json({ output: HELP });
    if (c === "stats") {
      const r: any = await env.DB.prepare(
        `SELECT (SELECT COUNT(*) FROM company) AS firmy, (SELECT COUNT(*) FROM user) AS uzivatele,
                (SELECT COUNT(*) FROM project) AS projekty, (SELECT COUNT(*) FROM issue) AS tickety,
                (SELECT COUNT(*) FROM message) AS zpravy`,
      ).first();
      return json({ output: Object.entries(r).map(([k, v]) => `${k}: ${v}`).join("\n") });
    }
    if (c === "companies") {
      const { results } = await env.DB.prepare(`SELECT name, is_provider, substr(token,1,10) AS token, recovery_email FROM company ORDER BY is_provider DESC, name`).all();
      return json({ output: termTable(results as any[]) });
    }
    if (c === "projects") {
      const { results } = await env.DB.prepare(`SELECT key, name, (SELECT COUNT(*) FROM issue i WHERE i.project_id = p.id) AS tickety FROM project p ORDER BY key`).all();
      return json({ output: termTable(results as any[]) });
    }
    if (c === "audit") {
      const n = Math.min(Math.max(parseInt(parts[1] || "20", 10) || 20, 1), 100);
      const { results } = await env.DB.prepare(`SELECT datetime(at, 'unixepoch', 'localtime') AS cas, action, entity_type AS typ, entity_id AS id FROM audit_log ORDER BY at DESC LIMIT ?`).bind(n).all();
      return json({ output: termTable(results as any[]) });
    }
    if (c === "sql") {
      const q = cmd.slice(3).trim();
      if (!/^select\b/i.test(q)) return json({ output: "Povoleny jsou jen SELECT dotazy." });
      if (q.includes(";")) return json({ output: "Jen jeden dotaz, bez středníku." });
      const { results } = await env.DB.prepare(q).all();
      return json({ output: termTable(results as any[]) });
    }
    return json({ output: `Neznámý příkaz '${c}'. Napiš 'help'.` });
  } catch (e: any) {
    return json({ output: "Chyba: " + String(e?.message ?? e) });
  }
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
      return json({ ok: true, service: "helpdesk", version: "0.1.0", commit: VERSION.commit, built: VERSION.built, ai: env.AI_PROVIDER });
    }

    if (p.startsWith("/api/")) {
      // živý kanál ticketu (WebSocket) → Durable Object
      const live = p.match(/^\/api\/tickets\/([^/]+)\/live$/);
      if (live) {
        return env.TICKET.get(env.TICKET.idFromName(live[1])).fetch(req);
      }

      // veřejné (bez tokenu firmy): příjemce pozvánky si ji zobrazí a přijme
      if (p === "/api/invite" && req.method === "GET") return await getInvite(env, url.searchParams.get("token") || "");
      if (p === "/api/invite/accept" && req.method === "POST") return await acceptInvite(env, req);

      const company = await authCompany(env, req);
      if (!company) return json({ error: "neplatný nebo chybějící token firmy" }, 401);

      try {
        if (p === "/api/projects" && req.method === "GET") return await listProjects(env, company);
        if (p === "/api/projects" && req.method === "POST") return await createProject(env, company, req);
        const pm = p.match(/^\/api\/projects\/([^/]+)$/);
        if (pm && req.method === "POST") return await updateProject(env, company, pm[1], req);
        if (p === "/api/contacts" && req.method === "GET") return await listContacts(env, company);
        if (p === "/api/invitations" && req.method === "POST") return await createInvitation(env, company, req);
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
          if (p === "/api/admin/terminal" && req.method === "POST") return await adminTerminal(env, req);
          if (p === "/api/admin/audit" && req.method === "GET") return await getAuditLog(env, url);
          if (p === "/api/admin/kpi" && req.method === "GET") return await getKpi(env);
          const am = p.match(/^\/api\/admin\/companies\/([^/]+)(\/token|\/revoke|\/email)$/);
          if (am && req.method === "POST") {
            if (am[2] === "/token") return await setCompanyToken(env, am[1], req);
            if (am[2] === "/revoke") return await revokeCompany(env, am[1]);
            if (am[2] === "/email") return await setCompanyEmail(env, am[1], req);
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
