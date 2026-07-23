# HelpDesk — HANDOFF (zdroj pravdy)

Cloudový ticket/helpdesk systém na **maxferit.com**. Zákaznický helpdesk (model NAVERTICA)
nad stromovou strukturou práce (epic → úkol → podúkol, model JIRA), s SLA, plánovačem,
KPI, přepínatelnou AI vrstvou a doložitelným auditem.

**Návrhový dokument (živý, místo pravdy pro architekturu):**
https://claude.ai/code/artifact/efc9654c-c8f4-45e4-b7de-325fc11e6365

## Stack
- **Cloudflare Workers** (TS, ES modules) — API + servírování SPA
- **D1** — centrální relační data (`schema.sql`)
- **Durable Object `TicketRoom`** — živý stav vlákna + dvousměrný Gantt (WebSocket)
- **R2 `helpdesk-attachments`** — přílohy + printscreeny
- **Workers AI** (+ Vectorize) — free AI vrstva; Claude volitelně (placené)
- Repo: `D:\git\helpdesk` (Anamax443, zatím bez remote). Commit identita: Milan Trnka <info@maxferit.cz>.

## Zmrazená rozhodnutí (v0.1)
1. Gantt v1 = interaktivní osa s dvousměrnou vazbou (závislosti + kritická cesta = vrstva 2)
2. Audit = zatím jen změny (čtení volitelně později)
3. Přílohy = konfigurovatelné, default 10 souborů / 100 MB
4. maxferit = **provozovatel nad tenanty** (řešitelé vidí napříč zákazníky)
5. AI v1 = jen nad interními daty (web_search později)
- Interní viditelnost = admin-autorizace ke straně/doméně (pole `party`), ne pouhá shoda domény
- **Schvalování neblokuje práci** — interní pokyny běží bez schválení; approval workflow se aktivuje
  jen když je potřeba (billable / práh / podpis zákazníka). `issue.billable` + `issue.approval_state`.

## Stav
- [x] `schema.sql` — kompletní zmrazený model (16 tabulek)
- [x] Kostra Workeru: health, list/create/get ticketu, add message, změna stavu (validace přechodů), audit, DO
- [ ] `npm install`, vytvoření D1/R2, deploy — **zatím neproběhlo** (potřebuje CF login + svolení)
- [ ] AI vrstva (`src/ai.ts`), rozpočet, Gantt/Kanban/KPI, pozvánky, e-mail notifikace (teď stub)

## Zprovoznění (lokálně)
```powershell
npm install
Copy-Item .dev.vars.example .dev.vars   # doplnit INVITE_SECRET
wrangler d1 create helpdesk-db          # database_id → wrangler.jsonc
npm run db:init                         # aplikuje schema.sql lokálně
wrangler r2 bucket create helpdesk-attachments
npm run dev
```
Smoke test (nový terminál):
```powershell
# 1) seed firmy s tokenem + projektu (lokální DB)
wrangler d1 execute helpdesk-db --command "INSERT INTO company (id,name,token,is_provider,created_at) VALUES ('c1','maxferit','dev-token',1,strftime('%s','now'));"
wrangler d1 execute helpdesk-db --command "INSERT INTO project (id,company_id,name,created_at) VALUES ('p1','c1','Interní',strftime('%s','now'));"
# 2) API
curl http://localhost:8787/api/health
curl -X POST http://localhost:8787/api/tickets -H "x-helpdesk-token: dev-token" -H "content-type: application/json" -d '{"project_id":"p1","title":"Test ticket","description":"Něco nejede"}'
```

## Nasazení
`npm run deploy` (účet bass443). Před produkcí: `--remote` init D1, `wrangler secret put INVITE_SECRET`,
doplnit `database_id`. Deploy až po svolení.
