# HelpDesk

Cloudový ticket/helpdesk systém (maxferit.com) na Cloudflare Workers + D1 + Durable Objects + R2 + Workers AI.

Zákaznický helpdesk (model NAVERTICA) nad stromovou strukturou práce (epic → úkol → podúkol, model JIRA):
SLA, plánovač (Gantt / Kanban / kapacity týmu), manažerské KPI, přepínatelná AI vrstva (free Workers AI /
placený Claude), doložitelný audit. Easy mód (BFU jen popíše problém, AI zatřídí) i Extended mód.

Detaily, jak spustit a nasadit, viz **[HANDOFF.md](./HANDOFF.md)**. Datový model v **[schema.sql](./schema.sql)**.

Stav: **v0.1 — kostra**. Jádro (ticket + vláknové zprávy + stavy + audit) napsané, čeká na `npm install`
+ vytvoření D1/R2 + deploy.
