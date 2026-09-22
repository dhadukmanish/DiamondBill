# DiamondBill

Diamond trading / jewellery finance ERP — multi-firm accounting, certified-stone inventory, purchase & sales, lab processes and reports.

## Stack

| Layer | Tech |
| --- | --- |
| Web | React 18 + Vite 5 + TypeScript + Tailwind, TanStack Query, Zustand, react-hook-form |
| API | Node 20 + Fastify 5 + TypeScript, Drizzle ORM, zod, JWT |
| DB | PostgreSQL 16 |
| Shared | `packages/shared` — enums, permission catalog, nav tree, zod schemas used by both apps |

Monorepo managed with **pnpm workspaces**.

```
apps/api        Fastify API  (http://localhost:4000)
apps/web        Vite SPA     (http://localhost:5173, proxies /api → :4000)
packages/shared Types, enums, schemas, permissions, navigation
```

## Quick start

```bash
pnpm install
docker compose up -d                 # Postgres 16 on :5432 (user/pass/db = diamondbill)
cp apps/api/.env.example apps/api/.env
pnpm db:migrate                      # apply Drizzle migrations
pnpm db:seed                         # demo tenant + admin user + chart of accounts + settings
pnpm dev                             # runs api + web together
```

Login: `admin@diamondbill.local` / `Admin@1234`

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` / `dev:api` / `dev:web` | Dev servers |
| `pnpm build` | Build every workspace |
| `pnpm typecheck` | `tsc --noEmit` everywhere |
| `pnpm db:generate` | Generate a migration from `apps/api/src/db/schema` |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Seed demo tenant |

## Architecture notes

- **Multi-tenant**: every table carries `tenant_id`; users are scoped to firms/branches; `super_admin` bypasses the 79-key permission matrix, everyone else is checked per `sub_module` × `read|create|update|delete`.
- **API envelope**: `{ message, data }` on success, `{ error: { code, message, details } }` on failure; zod validation errors carry `path` so the UI maps them onto form fields.
- **Series**: per firm / branch / financial year / usedFor / regulated|unregulated, atomic `nextNumber` reservation; "Add Multiple" auto-fills `<CODE>P-26/27-` and `<CODE>K-26/27-`.
- **Custom fields engine**: fields per module with typed config; certified-diamond properties map to `diamondPropertyType` codes (shape, color, clarity …) used later by Rapaport pricing and lab processes. "Auto Import Property" seeds the standard set.
- **Chart of accounts**: 58 system accounts seeded per tenant, grouped tree, sub-types validated per account type.
- **UI kit**: one `DataTable` (search, sort, column customisation, pagination), `Modal`, `Combobox`, `FormSection`, etc. Lucide icons are imported explicitly (`src/lib/icons.tsx`) to keep the bundle small (~115 KB gzipped).

## Roadmap (build phases)

1. ✅ Foundation — auth, org (firm/branch/FY/currency), series, users & permissions, custom fields, chart of accounts, contacts, general settings
2. Masters — taxes, TDS/TCS, units, categories, labs, sales persons, terms, carriers, price lists
3. Inventory — products, certified products, FIFO stock lots, Rapaport pricing, stock views/adjustments/transfers
4. Transactions — memos, bills, invoices, notes, payments with allocations, auto journal posting, packages & shipments, lab issue/return
5. Reports & dashboard, print template builder, import wizard
