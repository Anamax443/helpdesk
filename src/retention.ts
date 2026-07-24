// Vynuceni retencni politiky (GDPR). Bezpecne opt-in: bez zaznamu v retention_policy
// se nic nemaze. Respektuje legal_hold. Bezi z naplanovaneho (cron) handleru.

import { Env } from "./types";

const now = () => Math.floor(Date.now() / 1000);
const uuid = () => crypto.randomUUID();
const MONTH = 30 * 24 * 3600;

async function audit(env: Env, action: string, entityId: string, after: unknown): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_log (id, at, actor_id, action, entity_type, entity_id, before, after)
     VALUES (?,?,?,?,?,?,?,?)`,
  )
    .bind(uuid(), now(), null, action, "issue", entityId, null, after ? JSON.stringify(after) : null)
    .run();
}

/** Projde per-firma politiky a nad uzavrenymi ticketi po lhute provede anonymizaci/smazani. */
export async function enforceRetention(env: Env): Promise<{ policies: number; purged: number }> {
  const t = now();
  let purged = 0;
  // v1: kategorie closed_tickets (audit_log/attachments/inactive_users = TODO)
  const { results: policies } = await env.DB.prepare(
    `SELECT * FROM retention_policy WHERE months IS NOT NULL AND category = 'closed_tickets'`,
  ).all<any>();

  for (const p of policies) {
    const cutoff = t - p.months * MONTH;
    const { results } = await env.DB.prepare(
      `SELECT i.id FROM issue i JOIN project pr ON pr.id = i.project_id
       WHERE pr.company_id = ? AND i.legal_hold = 0
         AND i.status IN ('closed_invoiced','closed_not_invoiced') AND i.updated_at < ?`,
    ).bind(p.company_id, cutoff).all<{ id: string }>();

    for (const it of results) {
      if (p.action === "delete") {
        await env.DB.prepare(`DELETE FROM message WHERE issue_id = ?`).bind(it.id).run();
        await env.DB.prepare(`DELETE FROM budget_line WHERE issue_id = ?`).bind(it.id).run();
        await env.DB.prepare(`DELETE FROM watcher WHERE issue_id = ?`).bind(it.id).run();
        await env.DB.prepare(`DELETE FROM attachment WHERE issue_id = ?`).bind(it.id).run();
        await env.DB.prepare(`DELETE FROM ai_suggestion WHERE issue_id = ?`).bind(it.id).run();
        await env.DB.prepare(`DELETE FROM dependency WHERE from_issue_id = ? OR to_issue_id = ?`).bind(it.id, it.id).run();
        await env.DB.prepare(`DELETE FROM issue WHERE id = ?`).bind(it.id).run();
      } else {
        // anonymize: zachova skelet ticketu (statistiky/audit), zbavi osobnich udaju
        await env.DB.prepare(
          `UPDATE issue SET title = '[anonymizovano]', description = NULL, author_id = NULL, assignee_id = NULL WHERE id = ?`,
        ).bind(it.id).run();
        await env.DB.prepare(
          `UPDATE message SET body_html = '[anonymizovano]', author_id = NULL, author_domain = NULL WHERE issue_id = ?`,
        ).bind(it.id).run();
      }
      await audit(env, "retention." + p.action, it.id, { category: p.category, months: p.months });
      purged++;
    }
  }
  return { policies: policies.length, purged };
}
