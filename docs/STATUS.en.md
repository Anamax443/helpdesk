# Project status — HelpDesk

_Updated: 2026-07-24 · version v0.1_ · 🇨🇿 [STATUS.md](./STATUS.md)

## Phases
| Phase | Status |
|---|---|
| Architecture design | ✅ Complete (frozen) |
| Data model (D1) | ✅ 16 tables |
| Worker core (API) | ✅ Done, verified |
| Frontend SPA | ✅ Done, verified |
| Verify-core (typecheck + smoke test) | ✅ Passed |
| Production deployment | 🔄 In progress |
| AI layer / budget / Gantt / Kanban / KPI | ⏳ Backlog |

## Core done
- **API**: `/api/health`, `/api/projects`, `/api/meta`, `/api/tickets` (list/create/get),
  `/api/tickets/:id/messages`, `/api/tickets/:id/status` (transition validation), append-only audit.
- **Frontend**: company-token login, ticket list (status/priority pills, project filter),
  **Easy** creation (describe → AI classifies) and **Extended** (full form), detail with threads,
  internal/shared messages, status change by allowed transitions, i18n **CS/EN**.
- **Verified**: `tsc --noEmit` clean; local smoke test (create → message → status,
  guards: invalid transition = 400, missing token = 401).

## Verified smoke test
```
HEALTH   ok, ai=workers-ai
CREATE   201  ticket #1, status=new
MESSAGE  201
STATUS   200  new -> open
GUARD    400  open -> closed_invoiced (invalid transition)
GUARD    401  no token
DETAIL   status=open, number=1, messages=1
```

## Backlog (priority)
1. Email notifications (currently a stub) — Cloudflare Email Routing
2. AI layer `src/ai.ts` — triage (Easy mode), similar tickets (Vectorize), translation
3. Budget + per-line approval
4. Gantt / Kanban / team capacity planning
5. Management KPIs (dashboard over `metric_snapshot`)
6. Provider-admin console — company token registry + per-token expiry
