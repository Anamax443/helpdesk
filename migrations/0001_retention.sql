-- Migrace 0001: retencni politika + legal hold (GDPR)
-- Apply: wrangler d1 execute helpdesk-db --file=migrations/0001_retention.sql   (--remote pro produkci)

ALTER TABLE issue ADD COLUMN legal_hold INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS retention_policy (
  id         TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id),
  category   TEXT NOT NULL,                     -- closed_tickets | audit_log | attachments | inactive_users
  months     INTEGER,                           -- retention period; NULL = keep forever (no purge)
  action     TEXT NOT NULL DEFAULT 'anonymize', -- anonymize | delete
  created_at INTEGER NOT NULL,
  UNIQUE(company_id, category)
);
CREATE INDEX IF NOT EXISTS idx_retention_company ON retention_policy(company_id);
