# DiamondBill — Progress & Session Handoff

**Purpose:** first thing an agent reads in a new session. Keep it short and current.
Update it at the end of every work package (`/handoff`).

Last updated: **2026-09-23** · HEAD: `42590bb` · branch `main`, in sync with origin.

**Live:** https://md.pratishthabridal.in — see [DEPLOY.md](DEPLOY.md). Deploy with `/deploy`.

---

## Roadmap status

| # | Phase | Status |
| --- | --- | --- |
| 0 | Foundation — auth, org (firm/branch/FY/currency), series, users & permissions, custom fields, chart of accounts, contacts, general settings | ✅ done (`22ecc2e`) |
| 1 | Masters — taxes, TDS/TCS, units, categories, labs, sales persons, terms, cheque books, carriers, shipment statuses, payment modes/terms, processes, price lists, name templates | ✅ done (`cf4e95a`) |
| — | DataTable — dynamic filter builder, saved filters, column reorder, header sorting | ✅ done (`c03d4dd`) |
| — | Production deploy — Docker images, compose stack, host-nginx proxy, TLS, `/deploy` | ✅ done (`42590bb`) |
| 2 | Inventory — products, certified products, FIFO stock lots, Rapaport pricing, stock views/adjustments/transfers | ⬜ not started |
| 3 | Transactions — memos, bills, invoices, notes, payments with allocations, auto journal posting, packages & shipments, lab issue/return | ⬜ not started |
| 4 | Reports & dashboard, print template builder, import wizard | ⬜ not started |

> README.md's roadmap numbers phases 1–5; this table uses 0-based numbering to match the
> commit messages. "Phase 1 / masters" is the same thing in both.

## What is verified working

Verified end-to-end on 2026-09-23 against the local stack:

- `GET /api/health` → 200 `{"message":"ok","data":{"status":"up",…}}`
- Login → JWT, role `super_admin`
- Masters endpoints 200: `tax-groups`, `units`, `labs`, `terms-conditions`, `cheque-books`
  (all under `/api/accounting/masters`)
- Settings pages render with 0 console errors: Taxes, Units, Labs, Terms & Condition, Cheque Book
- Contacts DataTable: filter panel (Field/Operator/value, Add filter, Filter, Remove all),
  header-click sorting (`createdAt:desc` → `field:asc` → `field:desc`),
  Customize Columns drag-reorder + Save (persists via `PUT /api/column-preferences`)

Verified in **production** (https://md.pratishthabridal.in) on 2026-09-23:

- `/api/health` → 200; `/` → 200; deep link `/modules/crm/contacts` → 200
- `http://` → 301 → `https://`; cert valid to 2026-12-22, certbot auto-renew scheduled
- Login as `gnbmanish@gmail.com` → 200, role `super_admin`; authed `GET /api/crm/contacts` → 200
- Default `admin@diamondbill.local` / `Admin@1234` → **401** (not seeded in production)
- `web` bound to `127.0.0.1:8091` only; `db` not published at all
- Other sites on the box unaffected: ck 302, studio 200, pratishthabridal.com 200,
  dtechintegrity 200, motiwala 200, viratenterprise 301→www 200

## Known issues / open decisions

- **Coolify on the VPS is dead and we are not using it.** Its main container cannot start
  (port 8000 is held by a gunicorn app) and its Traefik proxy is not running. DiamondBill runs
  behind the **host nginx** instead, like the ~15 other sites on that box. Do not try to
  "fix" Coolify — it would fight nginx for :80/:443 and take down live sites and mail.
- **The VPS is shared.** ~15 live sites + a mail server + certbot. Read the warning at the top
  of `docs/DEPLOY.md` before touching anything on it.
- `valentinesjewels.com` returns 404 and `www.valentinesjewels.com` does not connect. **Not
  baselined before the nginx change**, so it is unknown whether this is pre-existing. Our change
  adds a server block for a different hostname and cannot affect it, but it is worth a look.
- Production **uploads are not backed up** (`api-uploads` volume), and the database has no
  backup beyond the weekly Hostinger VPS snapshot.
- Git prints many `LF will be replaced by CRLF` warnings. `.gitattributes` now pins LF for
  container files (`*.sh`, Dockerfiles, nginx.conf, compose, SQL) — the rest is cosmetic.
- Contacts has only one seeded record locally, so row-order alone cannot prove sorting; verify
  via the outgoing `sort` query param instead.
- The Jetro plugin may regenerate `CLAUDE.md` and wipe the DiamondBill content. Restore it from
  git history if that happens.

## Next up

**Phase 2 — Inventory.** Nothing in flight. Before writing code, read `docs/CONVENTIONS.md`
and use the `repo-scout` subagent to map the existing pattern.

## Session log

<!-- newest first, one line each -->
- **2026-09-23** — Deployed to production: https://md.pratishthabridal.in (docker compose behind host nginx + certbot); `/deploy` wired up.
- **2026-09-23** — Added agent context: CLAUDE.md, docs/, `.claude/agents`, `.claude/commands`; `.jetro/` gitignored.
- **2026-09-23** — DataTable filters/sort/column-order verified in browser, committed `c03d4dd`.
- **2026-09-23** — Phase 1 masters migrated, seeded, verified, committed `cf4e95a`.
- **2026-09-23** — Initial bootstrap: bundle imported, pushed to GitHub, Postgres on :5433, stack running.
