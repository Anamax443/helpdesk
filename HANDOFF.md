# HelpDesk — HANDOFF (zdroj pravdy)

Cloudový ticket/helpdesk systém na **maxferit.com**. Zákaznický helpdesk (model NAVERTICA)
nad stromovou strukturou práce (epic → úkol → podúkol, model JIRA), s SLA, plánovačem,
KPI, přepínatelnou AI vrstvou a doložitelným auditem.

**Živě:** https://helpdesk.maxferit.cz · https://helpdesk.bass443.workers.dev

**Návrhový dokument (živý, místo pravdy pro architekturu):**
https://claude.ai/code/artifact/efc9654c-c8f4-45e4-b7de-325fc11e6365

## Stack
- **Cloudflare Workers** (TS, ES modules) — API + servírování SPA
- **D1** — centrální relační data (`schema.sql`)
- **Durable Object `TicketRoom`** — živý stav vlákna + dvousměrný Gantt (WebSocket)
- **R2 `helpdesk-attachments`** — přílohy + printscreeny
- **Workers AI** (+ Vectorize) — free AI vrstva; Claude volitelně (placené)
- Repo: `Anamax443/helpdesk` (public). Commit identita: Milan Trnka <info@maxferit.cz>.

## Struktura
```
schema.sql            D1 model (15 tabulek)
src/index.ts          Worker: router + API (me, tickets, messages, status, retention, legal-hold,
                      admin: companies/token/revoke) + scheduled cron (retence)
src/types.ts          Env + stavy + povolené přechody
src/token.ts          HMAC pozvánkové tokeny
src/retention.ts      Vynucení retenční politiky (GDPR) — anonymizace/smazání
src/version.ts        GENEROVANÝ (scripts/gen-version.mjs při predeploy/predev; gitignored) — commit+build
src/do.ts             TicketRoom Durable Object (živý kanál)
migrations/           0001_retention.sql (legal_hold + retention_policy)
public/               SPA — login tokenem (routing admin/user), tickety (JIRA klíče), Projekty, Firmy (admin), Easy/Extended
docs/                 prezentace.html, manazersky-vystup.html, STATUS(.en).md
```

## Zmrazená rozhodnutí (v0.1)
1. Gantt v1 = interaktivní osa s dvousměrnou vazbou (závislosti + kritická cesta = vrstva 2)
2. Audit = zatím jen změny (čtení volitelně později)
3. Přílohy = konfigurovatelné, default 10 souborů / 100 MB
4. maxferit = **provozovatel nad tenanty** (řešitelé vidí napříč zákazníky)
5. AI v1 = jen nad interními daty (web_search později)
- Interní viditelnost = admin-autorizace ke straně/doméně (pole `party`), ne pouhá shoda domény
- **Schvalování neblokuje práci** — interní pokyny bez schválení; approval workflow jen když
  billable / práh / podpis zákazníka. `issue.billable` + `issue.approval_state`.

## Stav
- [x] `schema.sql` — kompletní zmrazený model (15 tabulek)
- [x] Worker jádro: health, projects, meta, list/create/get ticketu, zprávy, změna stavu (validace přechodů), audit, DO
- [x] **Frontend SPA** — login tokenem, seznam, Easy/Extended zakládání, detail + vlákna + přechody, i18n CS/EN
- [x] **Verify-core** — `tsc` 0 chyb + lokální `wrangler dev` smoke test prošel (create/message/status + guardy 400/401)
- [x] **Retenční politika (GDPR)** — per-firma politika + legal-hold + denní cron `0 3 * * *`; ověřeno (anonymizace jen ticketů bez holdu) + nasazeno
- [x] **Admin konzole (provider)** — jednotný login, routing dle tokenu (admin/user), správa firem + tokenů (generování / expirace / revokace); ověřeno + nasazeno
- [x] **JIRA klíče + Projekty + Easy** — alfanumerická čísla ticketů (IT-270, per-projekt), sekce Projekty (podmínky projektu), Easy mód = jen popis (AI dopočítá zbytek); ověřeno + nasazeno
- [x] **Bezpečnost adminu + verze + dark mode** — admin token trvalý (neexpiruje), bezešvá výměna vlastního tokenu, recovery e-mail (auto-save), commit+čas buildu v hlavičce (`gen-version.mjs`), přepínač motivu (data-theme)
- [x] **Kontakty + pozvánky + běžící hodiny** — sekce Kontakty (lidé + role/oprávnění), pozvánka e-mailem → self-service uživatel (`/api/invite*`, HMAC token), živé hodiny v hlavičce; ověřeno + nasazeno
- [x] **Admin terminál** — příkazová konzole (`stats`/`companies`/`projects`/`audit`/read-only `sql`), jen provider
- [x] **Ops konzole (dle ITDashboardu)** — Terminál = pasivní živý log (auto-refresh 2,5 s), Historie (filtr auditu), KPI (+legenda), Nastavení (retence + systém), Dokumentace; jen provider; ověřeno + nasazeno
- [x] Dokumentace CS+EN, prezentace, manažerský výstup
- [x] **Produkční nasazení** — živě na helpdesk.maxferit.cz (custom doména + workers.dev), remote D1 + secret nastaveny
- [ ] Další moduly: AI vrstva (`src/ai.ts`), rozpočet/schvalování, Gantt/Kanban/KPI, pozvánky, e-mail (teď stub)

## Admin konzole (provider) — HOTOVO (základ)
Jednotný login: token → routing na **admin** (`is_provider=1`) nebo **user** prostředí — `/api/me` vrací `env`
(rozšiřitelné o další prostředí). Admin spravuje firmy a jejich **tokeny s expirací** (generování / expirace /
revokace) přes `/api/admin/companies*`. Zbývá (backlog): MFA, logování přístupů, správa uživatelů firem.

## Zprovoznění (lokálně)
```powershell
npm install
Copy-Item .dev.vars.example .dev.vars     # doplnit INVITE_SECRET
npm run db:init                            # aplikuje schema.sql na lokální D1
# seed firmy s tokenem + projektu:
wrangler d1 execute helpdesk-db --local --command "INSERT INTO company (id,name,token,is_provider,created_at) VALUES ('c1','maxferit','dev-token',1,strftime('%s','now'));"
wrangler d1 execute helpdesk-db --local --command "INSERT INTO project (id,company_id,name,created_at) VALUES ('p1','c1','Interni',strftime('%s','now'));"
npm run dev                                # http://127.0.0.1:8787  (login token: dev-token)
```
> Pozn.: `wrangler dev` poslouchá na `127.0.0.1` (ne `localhost`/IPv6). AI binding je remote (jen warning).

## Nasazení (produkce, účet bass443 — HOTOVO)
Živě na **helpdesk.maxferit.cz** (custom doména) + **helpdesk.bass443.workers.dev**.
Pozn.: `maxferit.com` NENÍ zóna v CF účtu bass443 — nasazeno na `maxferit.cz` (jako aukce.maxferit.cz).
Pro `.com` je nutné nejdřív přidat zónu `maxferit.com` do CF.
```powershell
wrangler d1 create helpdesk-db                            # [hotovo] database_id -> wrangler.jsonc
wrangler d1 execute helpdesk-db --remote --file=schema.sql # [hotovo]
wrangler secret put INVITE_SECRET                         # [hotovo]
npm run deploy                                            # [hotovo] -> helpdesk.maxferit.cz
# R2 (přílohy): OAuth token nemá r2 scope → binding dočasně vypnut. Po `wrangler login` (refresh):
#   wrangler r2 bucket create helpdesk-attachments  + odkomentovat r2_buckets ve wrangler.jsonc + redeploy
```
