# Stav projektu — HelpDesk

_Aktualizováno: 2026-07-24 · verze v0.1_ · 🇬🇧 [STATUS.en.md](./STATUS.en.md)

## Fáze
| Fáze | Stav |
|---|---|
| Návrh architektury | ✅ Kompletní (zmrazený) |
| Datový model (D1) | ✅ 16 tabulek |
| Jádro Workeru (API) | ✅ Hotové, ověřené |
| Frontend SPA | ✅ Hotové, ověřené |
| Verify-core (typecheck + smoke test) | ✅ Prošel |
| Produkční nasazení | 🔄 Probíhá |
| AI vrstva / rozpočet / Gantt / Kanban / KPI | ⏳ Backlog |

## Hotové jádro
- **API**: `/api/health`, `/api/projects`, `/api/meta`, `/api/tickets` (list/create/get),
  `/api/tickets/:id/messages`, `/api/tickets/:id/status` (validace přechodů), append-only audit.
- **Frontend**: login tokenem firmy, seznam ticketů (stav/priorita pilulky, filtr projektu),
  zakládání **Easy** (popis → AI zatřídí) i **Extended** (plný formulář), detail s vlákny,
  interní/sdílené zprávy, změna stavu dle povolených přechodů, i18n **CS/EN**.
- **Ověřeno**: `tsc --noEmit` bez chyb; lokální smoke test (create → message → status,
  guardy: neplatný přechod = 400, chybějící token = 401).

## Ověřený smoke test
```
HEALTH   ok, ai=workers-ai
CREATE   201  ticket #1, status=new
MESSAGE  201
STATUS   200  new → open
GUARD    400  open → closed_invoiced (nepovolený přechod)
GUARD    401  bez tokenu
DETAIL   status=open, number=1, messages=1
```

## Backlog (priorita)
1. E-mail notifikace (dnes stub) — Cloudflare Email Routing
2. AI vrstva `src/ai.ts` — triage (Easy mód), podobné tickety (Vectorize), překlad
3. Rozpočet + schvalování po položkách
4. Gantt / Kanban / plánování kapacit týmu
5. Manažerské KPI (dashboard nad `metric_snapshot`)
6. Provider-admin konzole — registr tokenů firem + expirace per token
