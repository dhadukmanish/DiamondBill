# Code conventions

Read this before writing code in DiamondBill. The patterns are consistent — follow the
existing one rather than inventing a second way to do the same thing.

---

## Shared package first

`packages/shared` is the contract between API and web: enums, zod schemas, the permission
catalog, the nav tree, filter types. **Both apps import from `@diamondbill/shared`.**

A new entity almost always starts there:
1. enum/const values → `src/enums.ts`
2. zod schema → `src/schemas/<area>.ts`, re-exported from `src/schemas/index.ts`
3. permission key → `src/permissions.ts`
4. nav entry → `src/nav.ts`

Never duplicate an enum or a validation rule in `apps/api` or `apps/web`.

## API

**Envelope.** Success is `{ message, data }` via `ok(data, message)` from `lib/respond.ts`.
Failure is `{ error: { code, message, details } }` — throw an `AppError` (or the
`notFound` / `forbidden` / `validation` helpers in `lib/errors.ts`); the error plugin formats it.
Zod details carry `path`, which the UI maps onto form fields.

**Multi-tenancy.** Every table has `tenant_id`. Every query filters
`eq(t.tenantId, req.user.tenantId)`. There is no exception.

**Permissions.** 79-key matrix, checked as `sub_module × read|create|update|delete`.
Guard routes with `app.requirePermission('<sub_module_key>')`. `super_admin` bypasses it.

**Registration.** Add a `<name>Routes` module in `src/routes/` and register it in
`src/routes/index.ts`.

### Adding a master (the 90% case)

Don't hand-write list/get/create/update/delete. Use `crudRoutes` from `lib/crud.ts`:

```ts
crudRoutes(app, {
  table: schema.units,
  base: `${M}/units`,              // M = '/api/accounting/masters'
  permission: 'acc_units',
  schema: unitSchema,              // from @diamondbill/shared
  label: 'Unit',
  listAll: true,                   // no pagination for small master tables
  searchColumns: [schema.units.name],
  defaultSort: schema.units.name,
  protectSystem: true,             // block delete of isSystem rows
  filter: (_req, q) => [ /* extra WHERE from query params */ ],
  toRow: (body, req, existing) => ({ /* body → row, both create & update */ }),
  shape: (row) => ({ /* row → response, e.g. numeric strings → numbers */ }),
});
```

It wires search, `filters=` (the DataTable filter builder), `sortBy`/`sortOrder`, pagination,
tenant scoping and permissions for free. `lib/filters.ts` turns the `filters` query param into
a Drizzle `WHERE`; `lib/list.ts` parses page/limit/search/sort.

Drizzle `numeric` columns come back as **strings** — convert in `toRow` (out) and `shape` (in).

### Migrations

Edit `apps/api/src/db/schema/*.ts`, then `pnpm db:generate`, then `pnpm db:migrate`.
Never hand-edit `drizzle/meta/`. `pnpm db:seed` must stay **idempotent** — it backfills the
existing tenant, it does not assume a fresh database.

## Web

**Data fetching** is TanStack Query via `src/lib/api.ts` (`api.get/post/put/delete` unwrap the
envelope) and the hooks in `src/lib/queries.ts`. Auth token lives in the Zustand store
`src/store/auth.ts`. Vite proxies `/api` → `:4000`, so use relative URLs.

**Routing** is in `App.tsx`. The login route is `/signin`. Protected routes redirect with
`?callbackUrl=`.

**Icons** are imported explicitly in `src/lib/icons.tsx` to keep the bundle ~115 KB gzipped.
Do not `import * from 'lucide-react'`.

### Adding a master page (the 90% case)

Declare a `MasterConfig` and hand it to `<MasterPage>` — see
`src/pages/settings/MasterPages.tsx` for ~15 worked examples:

```tsx
const cfg: MasterConfig = {
  title: 'Units', label: 'Unit', url: `${M}/units`,
  permission: 'acc_units', queryKey: 'units',
  columns: [{ key: 'name', header: 'Unit Name', render: (r) => r.name }, …],
  defaults: { name: '', isActive: true },
  fields:  [{ name: 'name', label: 'Unit Name', required: true },
            { name: 'uqc', label: 'UQC', type: 'select', options: […],
              visible: (v) => v.someOtherField === 'x' }],
};
return <MasterPage cfg={cfg} />;
```

`MasterPage` gives you the DataTable, the create/edit modal, delete confirm, toasts and
permission gating. `fields[].visible` drives conditional form fields.

### DataTable

One component, `src/components/data/DataTable.tsx`, used everywhere: search, dynamic filter
builder (Field / Operator / value, Add filter, Filter, Remove all, save named filters),
header-click sorting, `⋮ → Customize Columns` drag-reorder persisted via
`PUT /api/column-preferences`. Column reorder uses **HTML5 native drag** — a synthetic
`DragEvent` will not work in tests, you need a real mouse drag.

## Style

- TypeScript strict, no `any` in new code except where `crudRoutes`' generics force it.
- Match the density of the file you are in — this codebase favours compact, declarative config
  objects over long imperative functions.
- `pnpm typecheck` must pass before committing.
