# HelpDesk

Cloud ticket/helpdesk system (**maxferit.com**) on Cloudflare Workers + D1 + Durable Objects + R2 + Workers AI.

A customer helpdesk (**NAVERTICA** model) over a tree work structure (epic → task → subtask, **JIRA** model):
per-company SLA, planner (Gantt / Kanban / team capacity), management KPIs, a switchable AI layer
(free Workers AI / paid Claude), and an auditable trail. **Easy mode** (a non-technical user just describes
the problem, AI classifies it) and **Extended mode** (full form).

**Live:** https://helpdesk.maxferit.cz

🇨🇿 Česky: [README.md](./README.md)

## Quick start
```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
npm run db:init
npm run dev            # http://127.0.0.1:8787
```
Full setup, seeding and deployment: **[HANDOFF.md](./HANDOFF.md)**. Data model: **[schema.sql](./schema.sql)**.

## Done (v0.1)
- Data model (16 tables), Worker core (tickets, threaded messages, statuses with transition validation, audit)
- Frontend SPA (token login, list, Easy/Extended creation, detail, i18n CS/EN)
- Verified locally (typecheck + smoke test)

## Status
**v0.1 — core + frontend done and verified.** Next: AI layer, budget/approval, Gantt/Kanban/KPI, email, invitations.
