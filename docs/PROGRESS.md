# DiamondBill — Progress & Session Handoff

**Purpose:** first thing an agent reads in a new session. Keep it short and current.
Update it at the end of every work package (`/handoff`).

Last updated: **2026-09-23** · HEAD: `c03d4dd` · branch `main`.

> ⚠️ **Uncommitted:** the agent-context scaffolding (`CLAUDE.md`, `docs/`, `.claude/`) and the
> `.gitignore` change are written but **not yet committed**. Commit them first thing:
> `/safe-commit "docs: agent context, dev setup, conventions, subagents"`

---

## Roadmap status

| # | Phase | Status |
| --- | --- | --- |
| 0 | Foundation — auth, org (firm/branch/FY/currency), series, users & permissions, custom fields, chart of accounts, contacts, general settings | ✅ done (`22ecc2e`) |
| 1 | Masters — taxes, TDS/TCS, units, categories, labs, sales persons, terms, cheque books, carriers, shipment statuses, payment modes/terms, processes, price lists, name templates | ✅ done (`cf4e95a`) |
| — | DataTable — dynamic filter builder, saved filters, column reorder, header sorting | ✅ done (`c03d4dd`) |
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

## Known issues / open decisions

- **Resolved:** `.jetro/` is now in `.gitignore` (it holds real credentials and the repo is
  public), so `git status` no longer lists it and `git add -A` is safe again. `/safe-commit`
  still double-checks. If gitignoring it was the wrong call, revert that one line.
- Git prints many `LF will be replaced by CRLF` warnings. A `.gitattributes` would silence them.
  Not added — cosmetic, and it rewrites line endings across the tree.
- Contacts has only one seeded record ("Ramesh Kavad"), so row-order alone cannot prove sorting;
  verify via the outgoing `sort` query param instead.
- The Jetro plugin generated its own boilerplate into `CLAUDE.md`, `AGENT.md`, `.agents/`,
  `.cursor/` and `.windsurfrules`. Only `CLAUDE.md` was rewritten for DiamondBill (the Jetro
  text kept as an appendix). If Jetro regenerates it and wipes that, restore from git history.

## Next up

1. Commit the scaffolding flagged at the top of this file.
2. **Phase 2 — Inventory.** Nothing is in flight; no code work has started on it. Before
   writing code, read `docs/CONVENTIONS.md` and use the `repo-scout` subagent to map the
   existing pattern rather than reading files in the main conversation.

## Session log

<!-- newest first, one line each -->
- **2026-09-23** — Added agent context: CLAUDE.md, docs/, `.claude/agents`, `.claude/commands`; `.jetro/` gitignored.
- **2026-09-23** — DataTable filters/sort/column-order verified in browser, committed `c03d4dd`.
- **2026-09-23** — Phase 1 masters migrated, seeded, verified, committed `cf4e95a`.
- **2026-09-23** — Initial bootstrap: bundle imported, pushed to GitHub, Postgres on :5433, stack running.
