# HelpDesk

Cloudový ticket/helpdesk systém (**maxferit.com**) na Cloudflare Workers + D1 + Durable Objects + R2 + Workers AI.

Zákaznický helpdesk (model **NAVERTICA**) nad stromovou strukturou práce (epic → úkol → podúkol, model **JIRA**):
SLA per firma, plánovač (Gantt / Kanban / kapacity týmu), manažerské KPI, přepínatelná AI vrstva
(free Workers AI / placený Claude), doložitelný audit. **Easy mód** (BFU jen popíše problém, AI zatřídí)
i **Extended mód** (plný formulář).

🇬🇧 English: [README.en.md](./README.en.md)

## Rychlý start
```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
npm run db:init
npm run dev            # http://127.0.0.1:8787
```
Podrobný setup, seed a nasazení: **[HANDOFF.md](./HANDOFF.md)**. Datový model: **[schema.sql](./schema.sql)**.

## Co je hotové (v0.1)
- Datový model (16 tabulek), jádro Workeru (tickety, vláknové zprávy, stavy s validací přechodů, audit)
- Frontend SPA (login tokenem, seznam, Easy/Extended zakládání, detail, i18n CS/EN)
- Ověřeno lokálně (typecheck + smoke test)

## Dokumentace
- [HANDOFF.md](./HANDOFF.md) — zdroj pravdy, setup, nasazení
- [docs/STATUS.md](./docs/STATUS.md) — stav projektu
- [docs/prezentace.html](./docs/prezentace.html) — prezentace projektu
- [docs/manazersky-vystup.html](./docs/manazersky-vystup.html) — manažerský výstup

## Stav
**v0.1 — jádro + frontend hotové a ověřené.** Další: AI vrstva, rozpočet/schvalování, Gantt/Kanban/KPI, e-mail, pozvánky.
