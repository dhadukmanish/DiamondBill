import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, ilike, or, sql, count } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { firmSchema, branchSchema, fiscalYearSchema, currencySchema } from '@diamondbill/shared';
import { parse } from '../lib/validate';
import { notFound, validation } from '../lib/errors';
import { ok } from '../lib/respond';
import { parseListQuery } from '../lib/list';
import { logActivity } from '../services/activity';
import { z } from 'zod';

export async function orgRoutes(app: FastifyInstance) {
  // ---------- Firms ----------
  app.get('/api/organizations/my-firms', { preHandler: app.authenticate }, async (req) => {
    const rows = await db.select().from(schema.firms).where(eq(schema.firms.tenantId, req.user.tenantId)).orderBy(desc(schema.firms.isDefault), asc(schema.firms.name));
    const visible = req.user.role === 'super_admin' ? rows : rows.filter((f) => req.user.firmIds.includes(f.id));
    return ok(visible, 'Firms retrieved successfully');
  });

  app.get('/api/organizations/firms', { preHandler: app.requirePermission('admin_firms') }, async (req) => {
    const q = parseListQuery(req.query as any);
    const where = and(eq(schema.firms.tenantId, req.user.tenantId), q.search ? or(ilike(schema.firms.name, `%${q.search}%`), ilike(schema.firms.gstin, `%${q.search}%`)) : undefined);
    const [{ total }] = await db.select({ total: count() }).from(schema.firms).where(where);
    const rows = await db.select().from(schema.firms).where(where).orderBy(desc(schema.firms.isDefault), asc(schema.firms.name)).limit(q.limit).offset((q.page - 1) * q.limit);
    return ok({ rows, total: Number(total), page: q.page, pageSize: q.limit }, 'Firms retrieved successfully');
  });

  app.get('/api/organizations/firms/:id', { preHandler: app.requirePermission('admin_firms') }, async (req) => {
    const { id } = req.params as { id: string };
    const [row] = await db.select().from(schema.firms).where(and(eq(schema.firms.id, id), eq(schema.firms.tenantId, req.user.tenantId)));
    if (!row) throw notFound('Firm');
    return ok(row);
  });

  app.post('/api/organizations/firms', { preHandler: app.requirePermission('admin_firms', 'create') }, async (req) => {
    const body = parse(firmSchema, req.body);
    const [{ n }] = await db.select({ n: count() }).from(schema.firms).where(eq(schema.firms.tenantId, req.user.tenantId));
    const [row] = await db
      .insert(schema.firms)
      .values({ ...toFirmRow(body), tenantId: req.user.tenantId, isDefault: Number(n) === 0 })
      .returning();
    await db.insert(schema.branches).values({ tenantId: req.user.tenantId, firmId: row.id, name: row.name, isDefault: true });
    await logActivity(req, 'firm', row.id, 'created', `Firm "${row.name}" created`);
    return ok(row, 'Firm created successfully');
  });

  app.put('/api/organizations/firms/:id', { preHandler: app.requirePermission('admin_firms', 'update') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(firmSchema.partial(), req.body);
    const [row] = await db
      .update(schema.firms)
      .set({ ...toFirmRow(body as any), updatedAt: new Date() })
      .where(and(eq(schema.firms.id, id), eq(schema.firms.tenantId, req.user.tenantId)))
      .returning();
    if (!row) throw notFound('Firm');
    await logActivity(req, 'firm', row.id, 'updated', `Firm "${row.name}" updated`);
    return ok(row, 'Firm updated successfully');
  });

  app.delete('/api/organizations/firms/:id', { preHandler: app.requirePermission('admin_firms', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    const [row] = await db.select().from(schema.firms).where(and(eq(schema.firms.id, id), eq(schema.firms.tenantId, req.user.tenantId)));
    if (!row) throw notFound('Firm');
    if (row.isDefault) throw validation('The default firm cannot be deleted');
    await db.delete(schema.firms).where(eq(schema.firms.id, id));
    return ok(null, 'Firm deleted successfully');
  });

  // ---------- Branches ----------
  app.get('/api/organizations/branches', { preHandler: app.authenticate }, async (req) => {
    const q = parseListQuery(req.query as any);
    const where = and(
      eq(schema.branches.tenantId, req.user.tenantId),
      q.firmId ? eq(schema.branches.firmId, q.firmId) : undefined,
      q.search ? ilike(schema.branches.name, `%${q.search}%`) : undefined,
    );
    const [{ total }] = await db.select({ total: count() }).from(schema.branches).where(where);
    const rows = await db
      .select({ branch: schema.branches, firmName: schema.firms.name })
      .from(schema.branches)
      .innerJoin(schema.firms, eq(schema.firms.id, schema.branches.firmId))
      .where(where)
      .orderBy(desc(schema.branches.isDefault), asc(schema.branches.name))
      .limit(q.limit)
      .offset((q.page - 1) * q.limit);
    return ok({ rows: rows.map((r) => ({ ...r.branch, firmName: r.firmName })), total: Number(total), page: q.page, pageSize: q.limit }, 'Branches retrieved successfully');
  });

  app.post('/api/organizations/branches', { preHandler: app.requirePermission('admin_branches', 'create') }, async (req) => {
    const body = parse(branchSchema, req.body);
    const [row] = await db.insert(schema.branches).values({ ...body, tenantId: req.user.tenantId }).returning();
    await logActivity(req, 'branch', row.id, 'created', `Branch "${row.name}" created`);
    return ok(row, 'Branch created successfully');
  });

  app.put('/api/organizations/branches/:id', { preHandler: app.requirePermission('admin_branches', 'update') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(branchSchema.partial(), req.body);
    const [row] = await db
      .update(schema.branches)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(schema.branches.id, id), eq(schema.branches.tenantId, req.user.tenantId)))
      .returning();
    if (!row) throw notFound('Branch');
    return ok(row, 'Branch updated successfully');
  });

  app.delete('/api/organizations/branches/:id', { preHandler: app.requirePermission('admin_branches', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    const [row] = await db.select().from(schema.branches).where(and(eq(schema.branches.id, id), eq(schema.branches.tenantId, req.user.tenantId)));
    if (!row) throw notFound('Branch');
    if (row.isDefault) throw validation('The default branch cannot be deleted');
    await db.delete(schema.branches).where(eq(schema.branches.id, id));
    return ok(null, 'Branch deleted successfully');
  });

  // ---------- Fiscal years ----------
  app.get('/api/accounting/fiscal-years', { preHandler: app.authenticate }, async (req) => {
    const q = parseListQuery(req.query as any);
    const where = and(eq(schema.fiscalYears.tenantId, req.user.tenantId), q.firmId ? eq(schema.fiscalYears.firmId, q.firmId) : undefined, q.search ? ilike(schema.fiscalYears.name, `%${q.search}%`) : undefined);
    const rows = await db
      .select({ fy: schema.fiscalYears, firmName: schema.firms.name })
      .from(schema.fiscalYears)
      .innerJoin(schema.firms, eq(schema.firms.id, schema.fiscalYears.firmId))
      .where(where)
      .orderBy(desc(schema.fiscalYears.startDate));
    const list = rows.map((r) => ({ ...r.fy, firmName: r.firmName }));
    return ok({ rows: list, total: list.length, page: 1, pageSize: list.length }, 'Financial years retrieved successfully');
  });

  app.post('/api/accounting/fiscal-years', { preHandler: app.requirePermission('admin_financial_year', 'create') }, async (req) => {
    const body = parse(fiscalYearSchema, req.body);
    if (body.endDate <= body.startDate) throw validation('End date must be after start date');
    const [row] = await db.insert(schema.fiscalYears).values({ ...body, tenantId: req.user.tenantId }).returning();
    return ok(row, 'Financial year created successfully');
  });

  app.put('/api/accounting/fiscal-years/:id', { preHandler: app.requirePermission('admin_financial_year', 'update') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(fiscalYearSchema.partial(), req.body);
    const [row] = await db
      .update(schema.fiscalYears)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(schema.fiscalYears.id, id), eq(schema.fiscalYears.tenantId, req.user.tenantId)))
      .returning();
    if (!row) throw notFound('Financial year');
    return ok(row, 'Financial year updated successfully');
  });

  app.delete('/api/accounting/fiscal-years/:id', { preHandler: app.requirePermission('admin_financial_year', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    const r = await db.delete(schema.fiscalYears).where(and(eq(schema.fiscalYears.id, id), eq(schema.fiscalYears.tenantId, req.user.tenantId))).returning({ id: schema.fiscalYears.id });
    if (!r.length) throw notFound('Financial year');
    return ok(null, 'Financial year deleted successfully');
  });

  // ---------- Currencies ----------
  app.get('/api/accounting/masters/currencies', { preHandler: app.authenticate }, async (req) => {
    const rows = await db.select().from(schema.currencies).where(eq(schema.currencies.tenantId, req.user.tenantId)).orderBy(desc(schema.currencies.isBaseCurrency), asc(schema.currencies.code));
    return ok(rows, 'Currencies retrieved successfully');
  });
  app.post('/api/accounting/masters/currencies', { preHandler: app.requirePermission('admin_currencies', 'create') }, async (req) => {
    const body = parse(currencySchema, req.body);
    const [row] = await db.insert(schema.currencies).values({ ...body, code: body.code.toUpperCase(), tenantId: req.user.tenantId }).returning();
    return ok(row, 'Currency created successfully');
  });
  app.put('/api/accounting/masters/currencies/:id', { preHandler: app.requirePermission('admin_currencies', 'update') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(currencySchema.partial().extend({ exchangeRate: z.union([z.number(), z.string()]).optional(), isActive: z.boolean().optional() }), req.body);
    const [row] = await db
      .update(schema.currencies)
      .set({ ...body, exchangeRate: body.exchangeRate === undefined ? undefined : String(body.exchangeRate), updatedAt: new Date() })
      .where(and(eq(schema.currencies.id, id), eq(schema.currencies.tenantId, req.user.tenantId)))
      .returning();
    if (!row) throw notFound('Currency');
    return ok(row, 'Currency updated successfully');
  });
  app.delete('/api/accounting/masters/currencies/:id', { preHandler: app.requirePermission('admin_currencies', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    const [row] = await db.select().from(schema.currencies).where(and(eq(schema.currencies.id, id), eq(schema.currencies.tenantId, req.user.tenantId)));
    if (!row) throw notFound('Currency');
    if (row.isBaseCurrency) throw validation('The base currency cannot be deleted');
    await db.delete(schema.currencies).where(eq(schema.currencies.id, id));
    return ok(null, 'Currency deleted successfully');
  });

  // ---------- Lookups ----------
  app.get('/api/crm/lookup/firms', { preHandler: app.authenticate }, async (req) => {
    const rows = await db.select({ id: schema.firms.id, name: schema.firms.name, isDefault: schema.firms.isDefault, currency: schema.firms.currency }).from(schema.firms).where(eq(schema.firms.tenantId, req.user.tenantId)).orderBy(desc(schema.firms.isDefault), asc(schema.firms.name));
    return ok(req.user.role === 'super_admin' ? rows : rows.filter((f) => req.user.firmIds.includes(f.id)));
  });
  app.get('/api/crm/lookup/branches', { preHandler: app.authenticate }, async (req) => {
    const { firmId } = req.query as { firmId?: string };
    const rows = await db
      .select({ id: schema.branches.id, firmId: schema.branches.firmId, name: schema.branches.name, isDefault: schema.branches.isDefault })
      .from(schema.branches)
      .where(and(eq(schema.branches.tenantId, req.user.tenantId), firmId ? eq(schema.branches.firmId, firmId) : undefined))
      .orderBy(desc(schema.branches.isDefault), asc(schema.branches.name));
    return ok(rows, 'Branches retrieved successfully');
  });
  app.get('/api/common/lookups/fiscal-years', { preHandler: app.authenticate }, async (req) => {
    const { firmId } = req.query as { firmId?: string };
    const rows = await db
      .select({ id: schema.fiscalYears.id, firmId: schema.fiscalYears.firmId, name: schema.fiscalYears.name, startDate: schema.fiscalYears.startDate, endDate: schema.fiscalYears.endDate, isActive: schema.fiscalYears.isActive })
      .from(schema.fiscalYears)
      .where(and(eq(schema.fiscalYears.tenantId, req.user.tenantId), firmId ? eq(schema.fiscalYears.firmId, firmId) : undefined))
      .orderBy(desc(schema.fiscalYears.startDate));
    return ok(rows);
  });
}

function toFirmRow(b: Partial<ReturnType<typeof firmSchema.parse>>) {
  const { regulatedBank, unregulatedBank, ...rest } = b;
  return { ...rest, regulatedBank: regulatedBank ?? undefined, unregulatedBank: unregulatedBank ?? undefined } as any;
}

