import type { FastifyInstance } from 'fastify';
import { and, asc, eq, ilike, or, isNull, inArray } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { accountSchema, ACCOUNT_NATURE_BY_TYPE, ACCOUNT_SUB_TYPES } from '@diamondbill/shared';
import { parse } from '../lib/validate';
import { notFound, validation } from '../lib/errors';
import { ok } from '../lib/respond';

export async function accountRoutes(app: FastifyInstance) {
  /** Full tree with balances (balances come from journal — 0 until Phase 3) */
  app.get('/api/accounting/chart-of-accounts/tree', { preHandler: app.requirePermission('acc_chart_of_accounts') }, async (req) => {
    const { firmId, search } = req.query as { firmId?: string; search?: string };
    const rows = await db
      .select()
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.tenantId, req.user.tenantId),
          firmId ? or(isNull(schema.accounts.firmId), eq(schema.accounts.firmId, firmId)) : undefined,
          search ? ilike(schema.accounts.name, `%${search}%`) : undefined,
        ),
      )
      .orderBy(asc(schema.accounts.displayOrder), asc(schema.accounts.name));
    const byParent = new Map<string | null, typeof rows>();
    for (const r of rows) {
      const k = r.parentId ?? null;
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k)!.push(r);
    }
    const build = (parentId: string | null, level: number): any[] =>
      (byParent.get(parentId) ?? []).map((r) => ({ ...r, level, balance: 0, subTypeLabel: labelSub(r.accountType, r.accountSubType), children: build(r.id, level + 1) }));
    // orphan children (search filtered parents out)
    const roots = build(null, 0);
    if (search) {
      const inTree = new Set<string>();
      const walk = (n: any[]) => n.forEach((x) => { inTree.add(x.id); walk(x.children); });
      walk(roots);
      for (const r of rows) if (!inTree.has(r.id)) roots.push({ ...r, level: 0, balance: 0, subTypeLabel: labelSub(r.accountType, r.accountSubType), children: [] });
    }
    return ok(roots, 'Chart of accounts retrieved successfully');
  });

  /** Flat postable ledgers for pickers */
  app.get('/api/accounting/chart-of-accounts/ledgers', { preHandler: app.authenticate }, async (req) => {
    const { accountSubTypes, accountTypes } = req.query as { accountSubTypes?: string; accountTypes?: string };
    const subs = accountSubTypes?.split(',').filter(Boolean);
    const types = accountTypes?.split(',').filter(Boolean);
    const rows = await db
      .select()
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.tenantId, req.user.tenantId),
          eq(schema.accounts.isGroup, false),
          eq(schema.accounts.isActive, true),
          subs?.length ? inArray(schema.accounts.accountSubType, subs) : undefined,
          types?.length ? inArray(schema.accounts.accountType, types) : undefined,
        ),
      )
      .orderBy(asc(schema.accounts.accountType), asc(schema.accounts.name));
    return ok(rows.map((r) => ({ ...r, subTypeLabel: labelSub(r.accountType, r.accountSubType), balance: 0 })));
  });

  app.post('/api/accounting/chart-of-accounts', { preHandler: app.requirePermission('acc_chart_of_accounts', 'create') }, async (req) => {
    const body = parse(accountSchema, req.body);
    validateSub(body.accountType, body.accountSubType);
    if (body.parentId) {
      const [p] = await db.select().from(schema.accounts).where(and(eq(schema.accounts.id, body.parentId), eq(schema.accounts.tenantId, req.user.tenantId)));
      if (!p) throw validation('Parent account not found');
      if (p.accountType !== body.accountType) throw validation('Parent account must have the same account type');
    }
    const [row] = await db
      .insert(schema.accounts)
      .values({ ...body, tenantId: req.user.tenantId, nature: ACCOUNT_NATURE_BY_TYPE[body.accountType], createdBy: req.user.id, displayOrder: 1000 })
      .returning();
    return ok(row, 'Account created successfully');
  });

  app.put('/api/accounting/chart-of-accounts/:id', { preHandler: app.requirePermission('acc_chart_of_accounts', 'update') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(accountSchema.partial(), req.body);
    const [existing] = await db.select().from(schema.accounts).where(and(eq(schema.accounts.id, id), eq(schema.accounts.tenantId, req.user.tenantId)));
    if (!existing) throw notFound('Account');
    if (existing.isSystem && (body.accountType || body.accountSubType || body.isGroup !== undefined)) throw validation('System accounts can only change name, description and bank details');
    const type = body.accountType ?? existing.accountType;
    if (body.accountSubType) validateSub(type as any, body.accountSubType);
    const [row] = await db
      .update(schema.accounts)
      .set({ ...body, nature: ACCOUNT_NATURE_BY_TYPE[type as keyof typeof ACCOUNT_NATURE_BY_TYPE], updatedAt: new Date() })
      .where(eq(schema.accounts.id, id))
      .returning();
    return ok(row, 'Account updated successfully');
  });

  app.delete('/api/accounting/chart-of-accounts/:id', { preHandler: app.requirePermission('acc_chart_of_accounts', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    const [existing] = await db.select().from(schema.accounts).where(and(eq(schema.accounts.id, id), eq(schema.accounts.tenantId, req.user.tenantId)));
    if (!existing) throw notFound('Account');
    if (existing.isSystem) throw validation('System accounts cannot be deleted');
    const children = await db.select({ id: schema.accounts.id }).from(schema.accounts).where(eq(schema.accounts.parentId, id));
    if (children.length) throw validation('Delete or move child accounts first');
    await db.delete(schema.accounts).where(eq(schema.accounts.id, id));
    return ok(null, 'Account deleted successfully');
  });

  app.get('/api/accounting/chart-of-accounts/sub-types', { preHandler: app.authenticate }, async () => ok(ACCOUNT_SUB_TYPES));
}

function labelSub(type: string, sub: string) {
  return ACCOUNT_SUB_TYPES[type as keyof typeof ACCOUNT_SUB_TYPES]?.find((s) => s.value === sub)?.label ?? sub;
}
function validateSub(type: keyof typeof ACCOUNT_SUB_TYPES, sub: string) {
  if (!ACCOUNT_SUB_TYPES[type]?.some((s) => s.value === sub)) throw validation('Invalid sub type for the selected account type');
}
