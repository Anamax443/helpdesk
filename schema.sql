-- HelpDesk / Ticket — D1 schéma (zmrazený návrh v0.1)
-- Aplikace:  wrangler d1 execute helpdesk-db --file=schema.sql   (--remote pro produkci)
-- Konvence: id = TEXT (crypto.randomUUID), časy = INTEGER unix sekundy (created_at/at/…),
--           datumy plánu = TEXT ISO 'YYYY-MM-DD'. JSON pole jako TEXT.

PRAGMA foreign_keys = ON;

-- ── Tenant + identita ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  token            TEXT UNIQUE,                 -- přístupový token firmy (bootstrap admina)
  token_expires    INTEGER,                     -- unix s; NULL = bez expirace
  is_provider      INTEGER NOT NULL DEFAULT 0,  -- 1 = maxferit (dodavatel/provozovatel nad tenanty)
  default_language TEXT NOT NULL DEFAULT 'cs',
  ico              TEXT,                        -- IČ (ARES dotažení)
  created_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL REFERENCES company(id),
  email         TEXT NOT NULL UNIQUE,
  domain        TEXT NOT NULL,                  -- odvozeno z e-mailu (identita strany)
  first_name    TEXT,
  last_name     TEXT,
  language      TEXT NOT NULL DEFAULT 'cs',
  password_hash TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL
);

-- Scoped role (M:N). Interní status = existence membershipu s admin-autorizovanou `party`.
CREATE TABLE IF NOT EXISTS membership (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES user(id),
  scope_type TEXT NOT NULL,                     -- company | project
  scope_id   TEXT NOT NULL,
  role       TEXT NOT NULL,                     -- admin | solver | pm | contact | approver | watcher
  party      TEXT,                              -- admin-autorizovaná strana/doména → interní
  created_at INTEGER NOT NULL
);

-- ── Projekt + stromová struktura práce ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS project (
  id                 TEXT PRIMARY KEY,
  company_id         TEXT NOT NULL REFERENCES company(id),
  name               TEXT NOT NULL,
  manager_id         TEXT REFERENCES user(id),
  max_depth          INTEGER NOT NULL DEFAULT 5,
  default_visibility TEXT NOT NULL DEFAULT 'shared',  -- shared | internal
  created_at         INTEGER NOT NULL
);

-- Jeden strom: epic → úkol → podúkol^N (self-ref parent_id). Úkol vždy pod projektem.
CREATE TABLE IF NOT EXISTS issue (
  id                     TEXT PRIMARY KEY,
  number                 INTEGER,               -- lidské číslo ticketu
  parent_id              TEXT REFERENCES issue(id),  -- epic/nadřazený úkol; NULL = kořen pod projektem
  project_id             TEXT NOT NULL REFERENCES project(id),
  type                   TEXT NOT NULL DEFAULT 'task',  -- epic | task | subtask
  depth                  INTEGER NOT NULL DEFAULT 0,
  title                  TEXT NOT NULL,
  description            TEXT,
  request_type           TEXT,                  -- request | complaint
  status                 TEXT NOT NULL DEFAULT 'new',
  product_line           TEXT,
  functional_area        TEXT,
  importance             TEXT,                  -- normal | high | critical
  urgency                TEXT,                  -- normal | high | very_high
  priority               TEXT,                  -- blocking | critical | high | low
  internal               INTEGER NOT NULL DEFAULT 0,  -- 1 = interní nod (jen strana autora)
  billable               INTEGER NOT NULL DEFAULT 0,  -- účtovatelné → smí spustit approval workflow
  approval_state         TEXT,                  -- NULL = netřeba | pending | approved | declined
  assignee_id            TEXT REFERENCES user(id),
  author_id              TEXT REFERENCES user(id),
  planned_start          TEXT,                  -- ISO datum (Gantt)
  planned_end            TEXT,
  actual_start           TEXT,
  actual_end             TEXT,
  estimate_hours         REAL,                  -- odhad pracnosti (kapacitní plánování)
  requested_realization  TEXT,
  forecasted_realization TEXT,
  sla_due                INTEGER,               -- unix s (reakce/řešení dle SLA modelu)
  sla_breached           INTEGER NOT NULL DEFAULT 0,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL
);

-- Závislosti pro Gantt (vrstva 2: kritická cesta).
CREATE TABLE IF NOT EXISTS dependency (
  id            TEXT PRIMARY KEY,
  from_issue_id TEXT NOT NULL REFERENCES issue(id),
  to_issue_id   TEXT NOT NULL REFERENCES issue(id),
  type          TEXT NOT NULL DEFAULT 'FS'      -- finish-to-start
);

-- ── Komunikace ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message (
  id               TEXT PRIMARY KEY,
  issue_id         TEXT NOT NULL REFERENCES issue(id),
  parent_id        TEXT REFERENCES message(id),      -- odpověď ve vlákně
  author_id        TEXT REFERENCES user(id),
  author_domain    TEXT,                             -- pro doménové pravidlo viditelnosti
  visibility       TEXT NOT NULL DEFAULT 'shared',   -- shared | internal
  body_html        TEXT,
  high_priority    INTEGER NOT NULL DEFAULT 0,
  accepts_solution INTEGER NOT NULL DEFAULT 0,        -- checkbox „akceptuji řešení" → stav Accepted
  created_at       INTEGER NOT NULL
);

-- Přílohy (R2). Drag&drop / procházení / Ctrl+V printscreen — všechny sem.
CREATE TABLE IF NOT EXISTS attachment (
  id         TEXT PRIMARY KEY,
  issue_id   TEXT REFERENCES issue(id),
  message_id TEXT REFERENCES message(id),
  r2_key     TEXT NOT NULL,
  filename   TEXT NOT NULL,
  extension  TEXT,
  size       INTEGER,
  created_at INTEGER NOT NULL
);

-- ── Rozpočet (schvalování PO POLOŽKÁCH; neblokuje interní práci) ────────────
CREATE TABLE IF NOT EXISTS budget_line (
  id             TEXT PRIMARY KEY,
  issue_id       TEXT NOT NULL REFERENCES issue(id),
  service        TEXT,
  service_type   TEXT,
  description    TEXT,
  billing_method TEXT,                          -- rate_per_uom | fixed
  uom            TEXT,                          -- hour | km | credit | piece
  quantity       REAL,
  rate           REAL,
  total          REAL,
  state          TEXT NOT NULL DEFAULT 'sent',  -- sent | approved | rejected | expired
  currency       TEXT NOT NULL DEFAULT 'CZK',   -- CZK | EUR | ZAR
  approved_at    INTEGER,
  approved_by    TEXT,
  created_at     INTEGER NOT NULL
);

-- ── Sledovatelé / onboarding / SLA ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS watcher (
  id         TEXT PRIMARY KEY,
  issue_id   TEXT NOT NULL REFERENCES issue(id),
  user_id    TEXT REFERENCES user(id),
  email      TEXT,                              -- externí odběratel bez účtu
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invitation (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  scope_type TEXT NOT NULL,                     -- company | project | issue
  scope_id   TEXT NOT NULL,
  roles      TEXT NOT NULL,                     -- CSV rolí
  token      TEXT NOT NULL,                     -- HMAC podepsaný (src/token.ts)
  expires_at INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',   -- pending | accepted | expired | revoked
  invited_by TEXT,
  created_at INTEGER NOT NULL
);

-- SLA model per firma: matice priority → reakční + řešící doba + kalendář.
CREATE TABLE IF NOT EXISTS sla_policy (
  id              TEXT PRIMARY KEY,
  company_id      TEXT NOT NULL REFERENCES company(id),
  priority        TEXT NOT NULL,                -- blocking | critical | high | low
  response_mins   INTEGER NOT NULL,
  resolution_mins INTEGER NOT NULL,
  calendar        TEXT,                         -- json: provozní hodiny + TZ + svátky
  created_at      INTEGER NOT NULL
);

-- ── AI vrstva + audit + KPI ────────────────────────────────────────────────
-- AI návrhy: nic se neaplikuje samo, člověk potvrdí (status), vše dohledatelné.
CREATE TABLE IF NOT EXISTS ai_suggestion (
  id         TEXT PRIMARY KEY,
  issue_id   TEXT REFERENCES issue(id),
  kind       TEXT NOT NULL,                     -- triage | reply | summary | budget | dup | analysis
  provider   TEXT NOT NULL,                     -- workers-ai | claude
  model      TEXT,
  payload    TEXT,                              -- json
  status     TEXT NOT NULL DEFAULT 'suggested', -- suggested | accepted | dismissed
  decided_by TEXT,
  decided_at INTEGER,
  created_at INTEGER NOT NULL
);

-- Append-only audit (v1 jen změny). Dva pohledy: historie ticketu + compliance.
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  at          INTEGER NOT NULL,
  actor_id    TEXT,
  action      TEXT NOT NULL,                    -- issue.create | issue.status | message.add | budget.approve | …
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  before      TEXT,                             -- json
  after       TEXT                              -- json
);

-- KPI snapshoty (denní, pro levné trendy/grafy).
CREATE TABLE IF NOT EXISTS metric_snapshot (
  id         TEXT PRIMARY KEY,
  company_id TEXT REFERENCES company(id),
  project_id TEXT REFERENCES project(id),
  day        TEXT NOT NULL,                     -- ISO datum
  metric     TEXT NOT NULL,                     -- sla | throughput | budget | aging | capacity
  values     TEXT NOT NULL,                     -- json
  created_at INTEGER NOT NULL
);

-- ── Indexy ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_issue_project   ON issue(project_id);
CREATE INDEX IF NOT EXISTS idx_issue_parent    ON issue(parent_id);
CREATE INDEX IF NOT EXISTS idx_issue_status    ON issue(status);
CREATE INDEX IF NOT EXISTS idx_issue_assignee  ON issue(assignee_id);
CREATE INDEX IF NOT EXISTS idx_issue_sla       ON issue(sla_due);
CREATE INDEX IF NOT EXISTS idx_message_issue   ON message(issue_id);
CREATE INDEX IF NOT EXISTS idx_membership_user ON membership(user_id);
CREATE INDEX IF NOT EXISTS idx_membership_scope ON membership(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_attachment_issue ON attachment(issue_id);
CREATE INDEX IF NOT EXISTS idx_budget_issue    ON budget_line(issue_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity    ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_at        ON audit_log(at);
CREATE INDEX IF NOT EXISTS idx_invitation_token ON invitation(token);
CREATE INDEX IF NOT EXISTS idx_invitation_email ON invitation(email);
