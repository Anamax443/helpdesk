# Changelog

## v0.1 — 2026-07-24
Jádro + frontend, ověřeno lokálně.

### Přidáno
- Datový model D1 (`schema.sql`) — 16 tabulek: firmy/tenanti s tokenem, uživatelé, scoped role
  (membership + party), projekty, strom `issue` (epic → úkol → podúkol), závislosti, vláknové
  zprávy (sdílené/interní), přílohy, rozpočet po položkách, sledovatelé, pozvánky, SLA policy,
  AI návrhy, append-only audit, KPI snapshoty.
- Worker (Cloudflare Workers, TS): API `health`, `projects`, `meta`, `tickets` (list/create/get),
  `messages`, `status` (validace přechodů), append-only audit; `TicketRoom` Durable Object
  (živý WebSocket kanál); HMAC pozvánkové tokeny.
- Frontend SPA (`public/`): login tokenem, seznam ticketů (pilulky stav/priorita, filtr projektu),
  zakládání Easy/Extended, detail s vlákny a přechody stavů, i18n CS/EN.
- Dokumentace: HANDOFF, README (CS+EN), STATUS (CS+EN), prezentace a manažerský výstup (HTML).

### Rozhodnutí
- maxferit = provozovatel nad tenanty; audit jen změny; přílohy default 10/100 MB;
  Gantt v1 = osa (závislosti vrstva 2); AI v1 = jen interní data.
- Interní viditelnost = admin-autorizace ke straně/doméně (`party`), ne pouhá shoda domény.
- Schvalování neblokuje práci (`issue.billable` + `approval_state`).

### Opraveno
- `schema.sql`: přejmenován rezervovaný sloupec `values` → `data_json`; ASCII-safe komentáře pro D1 parser.
- `package.json`: `@cloudflare/workers-types` v5 (peer dep wrangleru).

### Ověřeno
- `tsc --noEmit` bez chyb; lokální smoke test (create/message/status + guardy 400/401).
