import type { FastifyInstance } from 'fastify';
import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { seriesSchema, seriesBulkSchema, SERIES_DEFAULT_CODES, SERIES_USED_FOR } from '@diamondbill/shared';
import { parse } from '../lib/validate';
import { notFound, validation } from '../lib/errors';
import { ok } from '../lib/respond';
import { parseListQuery } from '../lib/list';

export function formatSeriesNumber(s: { prefix: string; postfix: string; paddingLength: number }, n: number) {
  return `${s.prefix}${String(n).padStart(s.paddingLength, '0')}${s.postfix}`;
}

/** Atomically reserve the next number of a series. */
export async function consumeSeriesNumber(seriesId: string, tenantId: string, explicit?: number) {
  const [s] = await db.select().from(schema.series).where(and(eq(schema.series.id, seriesId), eq(schema.series.tenantId, tenantId)));
  if (!s) throw notFound('Series');
  const n = explicit ?? s.nextNumber;
  await db
    .update(schema.series)
    .set({ nextNumber: sql`GREATEST(${schema.series.nextNumber}, ${n + 1})`, updatedAt: new Date() })
    .where(eq(schema.series.id, seriesId));
  return { number: n, display: formatSeriesNumber(s, n), series: s };
}

function fyShort(fy: { startDate: string; endDate: string }) {
  const a = String(fy.startDate).slice(2, 4);
  const b = String(fy.endDate).slice(2, 4);
  return a === b ? a : `${a}/${b}`;
}

export async function seriesRoutes(app: FastifyInstance) {
  app.get('/api/crm/master/series', { preHandler: app.authenticate }, async (req) => {
    const q = parseListQuery(req.query as any);
    const { usedFor } = req.query as { usedFor?: string };
    const where = and(
      eq(schema.series.tenantId, req.user.tenantId),
      q.firmId ? eq(schema.series.firmId, q.firmId) : undefined,
      usedFor ? eq(schema.series.usedFor, usedFor) : undefined,
      q.search ? or(ilike(schema.series.prefix, `%${q.search}%`), ilike(schema.series.postfix, `%${q.search}%`), ilike(schema.series.seriesName, `%${q.search}%`)) : undefined,
    );
    const rows = await db
      .select({ s: schema.series, fyName: schema.fiscalYears.name, firmName: schema.firms.name, branchName: schema.branches.name })
      .from(schema.series)
      .innerJoin(schema.fiscalYears, eq(schema.fiscalYears.id, schema.series.fiscalYearId))
      .innerJoin(schema.firms, eq(schema.firms.id, schema.series.firmId))
      .leftJoin(schema.branches, eq(schema.branches.id, schema.series.branchId))
      .where(where)
      .orderBy(asc(schema.series.usedFor), asc(schema.series.seriesType));
    const list = rows.map((r) => ({ ...r.s, fiscalYearName: r.fyName, firmName: r.firmName, branchName: r.branchName, format: `${r.s.prefix}*${r.s.postfix}`, preview: formatSeriesNumber(r.s, r.s.nextNumber) }));
    const start = (q.page - 1) * q.limit;
    return ok({ rows: list.slice(start, start + q.limit), total: list.length, page: q.page, pageSize: q.limit }, 'Series retrieved successfully');
  });

  app.get('/api/crm/master/series/:id/preview', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const [s] = await db.select().from(schema.series).where(and(eq(schema.series.id, id), eq(schema.series.tenantId, req.user.tenantId)));
    if (!s) throw notFound('Series');
    return ok({ nextNumber: s.nextNumber, preview: formatSeriesNumber(s, s.nextNumber) });
  });

  app.post('/api/crm/master/series', { preHandler: app.requirePermission('crm_series', 'create') }, async (req) => {
    const body = parse(seriesSchema, req.body);
    const row = await createSeries(req.user.tenantId, body);
    return ok(row, 'Series created successfully');
  });

  app.post('/api/crm/master/series/bulk', { preHandler: app.requirePermission('crm_series', 'create') }, async (req) => {
    const body = parse(seriesBulkSchema, req.body);
    const created = [];
    for (const r of body.rows) {
      for (const type of ['regulated', 'unregulated'] as const) {
        const cfg = r[type];
        if (!cfg || (!(cfg.prefix ?? '').trim() && !(cfg.postfix ?? '').trim())) continue;
        created.push(await createSeries(req.user.tenantId, { firmId: body.firmId, branchId: body.branchId ?? null, fiscalYearId: body.fiscalYearId, usedFor: r.usedFor, seriesType: type, ...cfg }));
      }
    }
    return ok(created, `${created.length} series created successfully`);
  });

  /** Auto-fill defaults for the "Add Multiple" dialog */
  app.get('/api/crm/master/series/defaults', { preHandler: app.authenticate }, async (req) => {
    const { fiscalYearId } = req.query as { fiscalYearId?: string };
    let fyTag = '';
    if (fiscalYearId) {
      const [fy] = await db.select().from(schema.fiscalYears).where(eq(schema.fiscalYears.id, fiscalYearId));
      if (fy) fyTag = `-${fyShort(fy as any)}-`;
    }
    const rows = SERIES_USED_FOR.map((u) => ({
      usedFor: u,
      regulated: { prefix: `${SERIES_DEFAULT_CODES[u]}P${fyTag}`, postfix: '', paddingLength: 1, isDefault: true },
      unregulated: { prefix: `${SERIES_DEFAULT_CODES[u]}K${fyTag}`, postfix: '', paddingLength: 1, isDefault: false },
    }));
    return ok(rows);
  });

  app.put('/api/crm/master/series/:id', { preHandler: app.requirePermission('crm_series', 'update') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(seriesSchema.innerType().partial(), req.body);
    const [existing] = await db.select().from(schema.series).where(and(eq(schema.series.id, id), eq(schema.series.tenantId, req.user.tenantId)));
    if (!existing) throw notFound('Series');
    if (body.isDefault) await clearDefault(req.user.tenantId, body.firmId ?? existing.firmId, body.usedFor ?? existing.usedFor, body.seriesType ?? existing.seriesType);
    const prefix = body.prefix ?? existing.prefix;
    const postfix = body.postfix ?? existing.postfix;
    const [row] = await db
      .update(schema.series)
      .set({ ...body, seriesName: `${prefix}*${postfix}`, updatedAt: new Date() })
      .where(eq(schema.series.id, id))
      .returning();
    return ok(row, 'Series updated successfully');
  });

  app.delete('/api/crm/master/series/:id', { preHandler: app.requirePermission('crm_series', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    const r = await db.delete(schema.series).where(and(eq(schema.series.id, id), eq(schema.series.tenantId, req.user.tenantId))).returning({ id: schema.series.id });
    if (!r.length) throw notFound('Series');
    return ok(null, 'Series deleted successfully');
  });
}

async function clearDefault(tenantId: string, firmId: string, usedFor: string, seriesType: string) {
  await db
    .update(schema.series)
    .set({ isDefault: false })
    .where(and(eq(schema.series.tenantId, tenantId), eq(schema.series.firmId, firmId), eq(schema.series.usedFor, usedFor), eq(schema.series.seriesType, seriesType)));
}

type SeriesBody = { firmId: string; branchId?: string | null; fiscalYearId: string; usedFor: string; seriesType: string; prefix?: string; postfix?: string; paddingLength?: number; isDefault?: boolean };
async function createSeries(tenantId: string, raw: SeriesBody) {
  const body = { prefix: '', postfix: '', paddingLength: 1, isDefault: false, ...raw };
  if (!body.prefix.trim() && !body.postfix.trim()) throw validation('At least one of Prefix or Postfix is required');
  if (body.isDefault) await clearDefault(tenantId, body.firmId, body.usedFor, body.seriesType);
  const [row] = await db
    .insert(schema.series)
    .values({ ...body, tenantId, seriesName: `${body.prefix}*${body.postfix}` })
    .returning();
  return row;
}
