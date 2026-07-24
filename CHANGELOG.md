# Changelog

## v0.1.1 — 2026-07-24 · Retence (GDPR)
- Retenční politika per firma (`retention_policy`): kategorie × doba uchování × akce (anonymize/delete); opt-in.
- `issue.legal_hold` — vynětí ticketu z retence (spor/litigace).
- Vynucení naplánovaným cronem (`0 3 * * *`) — `enforceRetention()` v `src/retention.ts` + scheduled handler.
- API: `GET/POST /api/retention`, `POST /api/tickets/:id/hold`. Migrace `migrations/0001_retention.sql`.
- Ověřeno lokálně (anonymizace uzavřeného ticketu bez holdu; ticket s holdem nedotčen) + nasazeno.

## v0.1 — 2026-07-24
Jádro + frontend, ověřeno lokálně.

### Přidáno
- Datový model D1 (`schema.sql`) — 15 tabulek: firmy/tenanti s tokenem, uživatelé, scoped role
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

### Nasazeno
- Cloudflare (bass443): živě na **helpdesk.maxferit.cz** + workers.dev; remote D1 + `INVITE_SECRET`.
- Pozn.: `maxferit.com` není zóna v účtu → nasazeno na `maxferit.cz`. R2 binding dočasně vypnut (chybí r2 scope).
