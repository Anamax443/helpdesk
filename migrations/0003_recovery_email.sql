-- Migrace 0003: recovery e-mail admina (kotva pro obnovu pristupu)
-- Apply: wrangler d1 execute helpdesk-db --file=migrations/0003_recovery_email.sql   (--remote pro produkci)

ALTER TABLE company ADD COLUMN recovery_email TEXT;
