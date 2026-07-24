-- Migrace 0002: JIRA-style klic projektu (alfanumericka cisla ticketu PREFIX-N)
-- Apply: wrangler d1 execute helpdesk-db --file=migrations/0002_project_key.sql   (--remote pro produkci)

ALTER TABLE project ADD COLUMN key TEXT;
UPDATE project SET key = UPPER(SUBSTR(name, 1, 3)) WHERE key IS NULL OR key = '';
