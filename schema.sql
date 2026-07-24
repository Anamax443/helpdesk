-- HelpDesk / Ticket - D1 schema (v0.1)
-- Apply: wrangler d1 execute helpdesk-db --file=schema.sql   (--remote for production)
-- Convention: id = TEXT (crypto.randomUUID), times = INTEGER unix seconds,
--             plan dates = TEXT ISO date. JSON columns stored as TEXT.

-- === Tenant + identity ===
CREATE TABLE IF NOT EXISTS company (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  token            TEXT UNIQUE,                 -- firma access token (bootstraps admin)
  token_expires    INTEGER,                     -- unix s; NULL = no expiry
  is_provider      INTEGER NOT NULL DEFAULT 0,  -- 1 = maxferit (provider over tenants)
  default_language TEXT NOT NULL DEFAULT 'cs',
  ico              TEXT,                        -- IC (ARES lookup)
  recovery_email   TEXT,                        -- admin e-mail pro obnovu pristupu (nutny u provider)
  created_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL REFERENCES company(id),
  email         TEXT NOT NULL UNIQUE,
  domain        TEXT NOT NULL,                  -- derived from email (party identity)
  first_name    TEXT,
  last_name     TEXT,
  language      TEXT NOT NULL DEFAULT 'cs',
  password_hash TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL
);

-- Scoped role (M:N). Internal status = membership with admin-authorized party.
CREATE TABLE IF NOT EXISTS membership (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES user(id),
  scope_type TEXT NOT NULL,                     -- company | project
  scope_id   TEXT NOT NULL,
  role       TEXT NOT NULL,                     -- admin | solver | pm | contact | approver | watcher
  party      TEXT,                              -- admin-authorized party/domain = internal
  created_at INTEGER NOT NULL
);

-- === Project + work tree ===
CREATE TABLE IF NOT EXISTS project (
  id                 TEXT PRIMARY KEY,
  company_id         TEXT NOT NULL REFERENCES company(id),
  name               TEXT NOT NULL,
  key                TEXT,                          -- JIRA-style prefix (napr. IT, AX) -> IT-270
  manager_id         TEXT REFERENCES user(id),
  max_depth          INTEGER NOT NULL DEFAULT 5,
  default_visibility TEXT NOT NULL DEFAULT 'shared',  -- shared | internal
  created_at         INTEGER NOT NULL
);

-- One tree: epic > task > subtask^N (self-ref parent_id). Task always under a project.
CREATE TABLE IF NOT EXISTS issue (
  id                     TEXT PRIMARY KEY,
  number                 INTEGER,               -- human ticket number
  parent_id              TEXT REFERENCES issue(id),   -- epic/parent; NULL = root under project
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
  internal               INTEGER NOT NULL DEFAULT 0,  -- 1 = internal node (author party only)
  billable               INTEGER NOT NULL DEFAULT 0,  -- billable -> may trigger approval workflow
  approval_state         TEXT,                  -- NULL = not needed | pending | approved | declined
  assignee_id            TEXT REFERENCES user(id),
  author_id              TEXT REFERENCES user(id),
  planned_start          TEXT,                  -- ISO date (Gantt)
  planned_end            TEXT,
  actual_start           TEXT,
  actual_end             TEXT,
  estimate_hours         REAL,                  -- effort estimate (capacity planning)
  requested_realization  TEXT,
  forecasted_realization TEXT,
  sla_due                INTEGER,               -- unix s (response/resolution per SLA model)
  sla_breached           INTEGER NOT NULL DEFAULT 0,
  legal_hold             INTEGER NOT NULL DEFAULT 0,  -- vynato z retence (spor/litigace)
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL
);

-- Dependencies for Gantt (layer 2: critical path).
CREATE TABLE IF NOT EXISTS dependency (
  id            TEXT PRIMARY KEY,
  from_issue_id TEXT NOT NULL REFERENCES issue(id),
  to_issue_id   TEXT NOT NULL REFERENCES issue(id),
  type          TEXT NOT NULL DEFAULT 'FS'      -- finish-to-start
);

-- === Communication ===
CREATE TABLE IF NOT EXISTS message (
  id               TEXT PRIMARY KEY,
  issue_id         TEXT NOT NULL REFERENCES issue(id),
  parent_id        TEXT REFERENCES message(id),      -- reply in thread
  author_id        TEXT REFERENCES user(id),
  author_domain    TEXT,                             -- for domain visibility rule
  visibility       TEXT NOT NULL DEFAULT 'shared',   -- shared | internal
  body_html        TEXT,
  high_priority    INTEGER NOT NULL DEFAULT 0,
  accepts_solution INTEGER NOT NULL DEFAULT 0,        -- accept-solution checkbox -> status accepted
  created_at       INTEGER NOT NULL
);

-- Attachments (R2). Drag and drop / browse / paste printscreen all land here.
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

-- === Budget (per-line approval; does NOT block internal work) ===
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

-- === Watchers / onboarding / SLA ===
CREATE TABLE IF NOT EXISTS watcher (
  id         TEXT PRIMARY KEY,
  issue_id   TEXT NOT NULL REFERENCES issue(id),
  user_id    TEXT REFERENCES user(id),
  email      TEXT,                              -- external subscriber without account
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invitation (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  scope_type TEXT NOT NULL,                     -- company | project | issue
  scope_id   TEXT NOT NULL,
  roles      TEXT NOT NULL,                     -- CSV of roles
  token      TEXT NOT NULL,                     -- HMAC signed (src/token.ts)
  expires_at INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',   -- pending | accepted | expired | revoked
  invited_by TEXT,
  created_at INTEGER NOT NULL
);

-- SLA model per company: priority matrix -> response + resolution time + calendar.
CREATE TABLE IF NOT EXISTS sla_policy (
  id              TEXT PRIMARY KEY,
  company_id      TEXT NOT NULL REFERENCES company(id),
  priority        TEXT NOT NULL,                -- blocking | critical | high | low
  response_mins   INTEGER NOT NULL,
  resolution_mins INTEGER NOT NULL,
  calendar        TEXT,                         -- json: business hours + TZ + holidays
  created_at      INTEGER NOT NULL
);

-- Retencni politika per firma (GDPR): jak dlouho se drzi, pak anonymizace/smazani.
CREATE TABLE IF NOT EXISTS retention_policy (
  id         TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company(id),
  category   TEXT NOT NULL,                     -- closed_tickets | audit_log | attachments | inactive_users
  months     INTEGER,                           -- retention period; NULL = keep forever (no purge)
  action     TEXT NOT NULL DEFAULT 'anonymize', -- anonymize | delete
  created_at INTEGER NOT NULL,
  UNIQUE(company_id, category)
);

-- === AI layer + audit + KPI ===
-- AI suggestions: nothing auto-applied, human confirms (status), fully auditable.
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

-- Append-only audit (v1 changes only). Two views: ticket history + compliance.
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  at          INTEGER NOT NULL,
  actor_id    TEXT,
  action      TEXT NOT NULL,                    -- issue.create | issue.status | message.add | ...
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  before      TEXT,                             -- json
  after       TEXT                              -- json
);

-- KPI snapshots (daily, cheap trends/charts).
CREATE TABLE IF NOT EXISTS metric_snapshot (
  id         TEXT PRIMARY KEY,
  company_id TEXT REFERENCES company(id),
  project_id TEXT REFERENCES project(id),
  day        TEXT NOT NULL,                     -- ISO date
  metric     TEXT NOT NULL,                     -- sla | throughput | budget | aging | capacity
  data_json  TEXT NOT NULL,                     -- json (renamed; VALUES is reserved)
  created_at INTEGER NOT NULL
);

-- === Indexes ===
CREATE INDEX IF NOT EXISTS idx_issue_project    ON issue(project_id);
CREATE INDEX IF NOT EXISTS idx_issue_parent     ON issue(parent_id);
CREATE INDEX IF NOT EXISTS idx_issue_status     ON issue(status);
CREATE INDEX IF NOT EXISTS idx_issue_assignee   ON issue(assignee_id);
CREATE INDEX IF NOT EXISTS idx_issue_sla        ON issue(sla_due);
CREATE INDEX IF NOT EXISTS idx_message_issue    ON message(issue_id);
CREATE INDEX IF NOT EXISTS idx_membership_user  ON membership(user_id);
CREATE INDEX IF NOT EXISTS idx_membership_scope ON membership(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_attachment_issue ON attachment(issue_id);
CREATE INDEX IF NOT EXISTS idx_budget_issue     ON budget_line(issue_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity     ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_at         ON audit_log(at);
CREATE INDEX IF NOT EXISTS idx_invitation_token ON invitation(token);
CREATE INDEX IF NOT EXISTS idx_invitation_email ON invitation(email);
CREATE INDEX IF NOT EXISTS idx_retention_company ON retention_policy(company_id);
