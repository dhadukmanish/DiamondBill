import type { FastifyInstance } from 'fastify';
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { openingStockSchema, stockAdjustmentSchema, stockTransferSchema, itemTransferSchema, stockTallySchema } from '@diamondbill/shared';
import { parse } from '../lib/validate';
import { notFound, validation } from '../lib/errors';
import { ok } from '../lib/respond';
import { parseListQuery } from '../lib/list';
import { filterWhere, sortBy, tableColumns } from '../lib/filters';
import { logActivity } from '../services/activity';
import { getSettings } from '../services/settings';
import { stockIn, stockOut, reverseRef, getBalance } from '../services/stock';
import { consumeSeriesNumber } from './series';

const n = (v: unknown) => Number(v ?? 0);
const s4 = (v: number) => v.toFixed(4);
const B = schema.stockBalances, I = schema.productItems, P = schema.products;

async function itemNames(ids: string[]) {
  if (!ids.length) return new Map<string, { productName: string; itemName: string; sku: string }>();
  const rows = await db.select({ id: I.id, itemName: I.name, sku: I.sku, productName: P.name }).from(I).innerJoin(P, eq(P.id, I.productId)).where(inArray(I.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Reserve a document number: explicit `number` wins, else next of the default series for usedFor. */
async function docNumber(req: any, firmId: string, usedFor: string, seriesId?: string | null, explicit?: string | null) {
  if (explicit?.trim()) return { number: explicit.trim(), seriesId: seriesId ?? null };
  let sid = seriesId;
  if (!sid) {
    const [s] = await db.select().from(schema.series).where(and(eq(schema.series.tenantId, req.user.tenantId), eq(schema.series.firmId, firmId), eq(schema.series.usedFor, usedFor))).orderBy(desc(schema.series.isDefault)).limit(1);
    if (!s) throw validation(`No series configured for ${usedFor.replace(/_/g, ' ')} — add one under Settings → Series`);
    sid = s.id;
  }
  const r = await consumeSeriesNumber(sid, req.user.tenantId);
  return { number: r.display, seriesId: sid };
}

export async function stockRoutes(app: FastifyInstance) {
  /* ---------------- Stock view ---------------- */
  app.get('/api/accounting/inventory/stock-view', { preHandler: app.requirePermission('acc_stock_view') }, async (req) => {
    const q = parseListQuery(req.query as any);
    const { removeZero, stockType, categoryId } = req.query as Record<string, string | undefined>;
    const settings = await getSettings(req.user.tenantId);
    const where = and(
      eq(I.tenantId, req.user.tenantId),
      sql`${P.stockType} <> 'certified'`,
      stockType ? inArray(P.stockType, stockType.split(',')) : undefined,
      categoryId ? sql`${P.categoryIds} ? ${categoryId}` : undefined,
      q.search ? or(ilike(I.name, `%${q.search}%`), ilike(I.sku, `%${q.search}%`), ilike(P.name, `%${q.search}%`)) : undefined,
    );
    const balWhere = and(q.firmId ? sql`b.firm_id = ${q.firmId}` : undefined, q.branchId ? sql`b.branch_id = ${q.branchId}` : undefined);
    const agg = (col: string) => sql<string>`coalesce((select sum(b.${sql.raw(col)}) from ${B} b where b.product_item_id = ${I.id} ${balWhere ? sql`and ${balWhere}` : sql``}),0)`;
    const rowsAll = await db
      .select({ i: I, productName: P.name, unitName: schema.units.name, lowStockQty: P.lowStockQty, totalIn: agg('total_in'), totalOut: agg('total_out'), qtyOnHand: agg('qty_on_hand'), memoOut: agg('memo_out'), memoIn: agg('memo_in'), soCommitted: agg('so_committed'), value: agg('value') })
      .from(I).innerJoin(P, eq(P.id, I.productId)).leftJoin(schema.units, eq(schema.units.id, P.unitId))
      .where(where)
      .orderBy(asc(P.name), asc(I.name));
    let list = rowsAll.map((r) => {
      const qty = n(r.qtyOnHand), value = n(r.value), memoOut = n(r.memoOut), so = n(r.soCommitted);
      return { id: r.i.id, productId: r.i.productId, productName: r.productName, itemName: r.i.name, sku: r.i.sku, unitName: r.unitName, totalIn: n(r.totalIn), totalOut: n(r.totalOut), qtyOnHand: qty, memoOut, memoIn: n(r.memoIn), soCommitted: so, saleable: qty - memoOut - so, value, avgRate: qty ? value / qty : 0, purchasePrice: n(r.i.purchasePrice), sellingPrice: n(r.i.sellingPrice), currentValue: qty * n(r.i.sellingPrice), lowStock: r.lowStockQty != null && qty <= n(r.lowStockQty) };
    });
    if (removeZero === 'true') list = list.filter((r) => r.qtyOnHand !== 0 || r.memoOut !== 0);
    const kpis = { totalItems: list.length, memoOut: list.reduce((s, r) => s + r.memoOut, 0), lowStock: list.filter((r) => r.lowStock).length, totalStockValue: list.reduce((s, r) => s + r.currentValue, 0), inventoryAssetValue: list.reduce((s, r) => s + r.value, 0), valuation: settings.stockValuationMethod };
    const start = (q.page - 1) * q.limit;
    return ok({ rows: list.slice(start, start + q.limit), total: list.length, page: q.page, pageSize: q.limit, kpis });
  });

  /** Branch-wise pivot */
  app.get('/api/accounting/inventory/branch-wise-stock', { preHandler: app.requirePermission('acc_branch_wise_stock_view') }, async (req) => {
    const { firmId, categoryId, productId, search } = req.query as Record<string, string | undefined>;
    const branches = await db.select({ id: schema.branches.id, name: schema.branches.name, firmId: schema.branches.firmId }).from(schema.branches).where(and(eq(schema.branches.tenantId, req.user.tenantId), firmId ? eq(schema.branches.firmId, firmId) : undefined)).orderBy(asc(schema.branches.name));
    const rows = await db
      .select({ itemId: I.id, itemName: I.name, sku: I.sku, productName: P.name, branchId: B.branchId, qty: B.qtyOnHand })
      .from(B).innerJoin(I, eq(I.id, B.productItemId)).innerJoin(P, eq(P.id, I.productId))
      .where(and(eq(B.tenantId, req.user.tenantId), firmId ? eq(B.firmId, firmId) : undefined, productId ? eq(I.productId, productId) : undefined, categoryId ? sql`${P.categoryIds} ? ${categoryId}` : undefined, search ? or(ilike(I.name, `%${search}%`), ilike(I.sku, `%${search}%`), ilike(P.name, `%${search}%`)) : undefined));
    const byItem = new Map<string, any>();
    for (const r of rows) {
      const it = byItem.get(r.itemId) ?? { id: r.itemId, productName: r.productName, itemName: r.itemName, sku: r.sku, byBranch: {} as Record<string, number>, total: 0 };
      it.byBranch[r.branchId] = (it.byBranch[r.branchId] ?? 0) + n(r.qty);
      it.total += n(r.qty);
      byItem.set(r.itemId, it);
    }
    return ok({ branches, rows: Array.from(byItem.values()).sort((a, b) => a.productName.localeCompare(b.productName)) });
  });

  /** Month-wise in/out/closing for one item */
  app.get('/api/accounting/inventory/month-wise-summary', { preHandler: app.requirePermission('acc_month_wise_stock_summary') }, async (req) => {
    const { productItemId, firmId, branchId, year } = req.query as Record<string, string | undefined>;
    if (!productItemId) throw validation('Select a sub-product');
    const y = Number(year ?? new Date().getFullYear());
    const rows = await db
      .select({ m: sql<string>`to_char(${schema.stockMovements.movementDate}, 'YYYY-MM')`, kind: schema.stockMovements.kind, qty: sql<string>`sum(${schema.stockMovements.qty})`, value: sql<string>`sum(${schema.stockMovements.value})` })
      .from(schema.stockMovements)
      .where(and(eq(schema.stockMovements.tenantId, req.user.tenantId), eq(schema.stockMovements.productItemId, productItemId), firmId ? eq(schema.stockMovements.firmId, firmId) : undefined, branchId ? eq(schema.stockMovements.branchId, branchId) : undefined, sql`${schema.stockMovements.movementDate} < ${`${y + 1}-01-01`}`))
      .groupBy(sql`1`, schema.stockMovements.kind);
    const inKinds = ['in', 'adjust_in', 'transfer_in'], outKinds = ['out', 'adjust_out', 'transfer_out'];
    let opening = 0;
    for (const r of rows) if (r.m < `${y}-01`) opening += inKinds.includes(r.kind) ? n(r.qty) : outKinds.includes(r.kind) ? -n(r.qty) : 0;
    const months = Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`).map((m) => {
      const inQ = rows.filter((r) => r.m === m && inKinds.includes(r.kind)).reduce((s, r) => s + n(r.qty), 0);
      const outQ = rows.filter((r) => r.m === m && outKinds.includes(r.kind)).reduce((s, r) => s + n(r.qty), 0);
      const memoOut = rows.filter((r) => r.m === m && r.kind === 'memo_out').reduce((s, r) => s + n(r.qty), 0);
      const memoIn = rows.filter((r) => r.m === m && r.kind === 'memo_in').reduce((s, r) => s + n(r.qty), 0);
      const row = { month: m, opening, in: inQ, out: outQ, memoOut, memoIn, closing: opening + inQ - outQ };
      opening = row.closing;
      return row;
    });
    return ok({ year: y, months });
  });

  /* ---------------- Opening stock ---------------- */
  app.get('/api/accounting/inventory/opening-stock', { preHandler: app.requirePermission('acc_opening_stock') }, async (req) => {
    const { firmId, branchId, fiscalYearId, stockType } = req.query as Record<string, string | undefined>;
    if (!firmId || !fiscalYearId) return ok({ rows: [] });
    const items = await db.select({ i: I, productName: P.name, stockType: P.stockType, unitName: schema.units.name }).from(I).innerJoin(P, eq(P.id, I.productId)).leftJoin(schema.units, eq(schema.units.id, P.unitId)).where(and(eq(I.tenantId, req.user.tenantId), eq(I.isActive, true), sql`${P.stockType} <> 'certified'`, stockType ? eq(P.stockType, stockType) : undefined)).orderBy(asc(P.name), asc(I.name));
    const existing = await db.select().from(schema.openingStocks).where(and(eq(schema.openingStocks.firmId, firmId), eq(schema.openingStocks.fiscalYearId, fiscalYearId), branchId ? eq(schema.openingStocks.branchId, branchId) : undefined));
    return ok({ rows: items.map((r) => { const e = existing.find((x) => x.productItemId === r.i.id); return { productItemId: r.i.id, productName: r.productName, itemName: r.i.name, sku: r.i.sku, unitName: r.unitName, stockType: r.stockType, qty: n(e?.qty), rate: e ? n(e.rate) : n(r.i.purchasePrice), currency: e?.currency ?? 'INR', exchangeRate: n(e?.exchangeRate ?? 1), total: n(e?.qty) * n(e?.rate) * n(e?.exchangeRate ?? 1), saved: !!e }; }) });
  });

  /** Save opening stock lines (idempotent: replaces previous opening for firm/branch/FY/item) */
  app.put('/api/accounting/inventory/opening-stock', { preHandler: app.requirePermission('acc_opening_stock', 'update') }, async (req) => {
    const body = parse(openingStockSchema, req.body);
    const [fy] = await db.select().from(schema.fiscalYears).where(and(eq(schema.fiscalYears.id, body.fiscalYearId), eq(schema.fiscalYears.tenantId, req.user.tenantId)));
    if (!fy) throw notFound('Financial year');
    let saved = 0;
    await db.transaction(async (tx) => {
      for (const l of body.lines) {
        const [prev] = await tx.select().from(schema.openingStocks).where(and(eq(schema.openingStocks.firmId, body.firmId), eq(schema.openingStocks.branchId, body.branchId), eq(schema.openingStocks.fiscalYearId, body.fiscalYearId), eq(schema.openingStocks.productItemId, l.productItemId)));
        if (prev) {
          await reverseRef(req.user.tenantId, 'opening', prev.id, tx as any);
          await tx.delete(schema.openingStocks).where(eq(schema.openingStocks.id, prev.id));
        }
        if (l.qty <= 0) continue;
        const [row] = await tx.insert(schema.openingStocks).values({ tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, fiscalYearId: body.fiscalYearId, productItemId: l.productItemId, qty: s4(l.qty), rate: s4(l.rate), currency: l.currency, exchangeRate: String(l.exchangeRate) }).returning();
        await stockIn({ tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, productItemId: l.productItemId }, { date: String(fy.startDate), qty: l.qty, rate: l.rate * l.exchangeRate, refType: 'opening', refId: row.id, refNumber: `Opening ${fy.name}`, createdBy: req.user.id }, tx as any);
        saved++;
      }
    });
    await logActivity(req, 'opening_stock', null, 'updated', `Opening stock saved (${saved} lines)`);
    return ok({ saved }, 'Opening stock saved successfully');
  });

  /* ---------------- Stock adjustments ---------------- */
  app.get('/api/accounting/inventory/adjustments', { preHandler: app.requirePermission('acc_stock_adjustment') }, async (req) => {
    const q = parseListQuery(req.query as any);
    const T = schema.stockAdjustments;
    const COLS = { ...tableColumns(T), createdByName: schema.users.firstName };
    const where = and(eq(T.tenantId, req.user.tenantId), q.firmId ? eq(T.firmId, q.firmId) : undefined, q.branchId ? eq(T.branchId, q.branchId) : undefined, filterWhere((req.query as any).filters, COLS), q.search ? or(ilike(T.number, `%${q.search}%`), ilike(T.referenceNo, `%${q.search}%`), ilike(T.note, `%${q.search}%`)) : undefined);
    const [{ total }] = await db.select({ total: count() }).from(T).leftJoin(schema.users, eq(schema.users.id, T.createdBy)).where(where);
    const rows = await db.select({ t: T, firmName: schema.firms.name, branchName: schema.branches.name, createdByName: sql<string>`${schema.users.firstName} || ' ' || ${schema.users.lastName}` }).from(T).leftJoin(schema.firms, eq(schema.firms.id, T.firmId)).leftJoin(schema.branches, eq(schema.branches.id, T.branchId)).leftJoin(schema.users, eq(schema.users.id, T.createdBy)).where(where).orderBy(sortBy(q.sortBy, q.sortOrder, COLS, T.adjustmentDate)).limit(q.limit).offset((q.page - 1) * q.limit);
    return ok({ rows: rows.map((r) => ({ ...r.t, totalValue: n(r.t.totalValue), firmName: r.firmName, branchName: r.branchName, createdByName: r.createdByName })), total: Number(total), page: q.page, pageSize: q.limit });
  });

  app.get('/api/accounting/inventory/adjustments/:id', { preHandler: app.requirePermission('acc_stock_adjustment') }, async (req) => {
    const { id } = req.params as { id: string };
    const [r] = await db.select().from(schema.stockAdjustments).where(and(eq(schema.stockAdjustments.id, id), eq(schema.stockAdjustments.tenantId, req.user.tenantId)));
    if (!r) throw notFound('Adjustment');
    return ok({ ...r, totalValue: n(r.totalValue) });
  });

  app.post('/api/accounting/inventory/adjustments', { preHandler: app.requirePermission('acc_stock_adjustment', 'create') }, async (req) => {
    const body = parse(stockAdjustmentSchema, req.body);
    const names = await itemNames(body.lines.map((l) => l.productItemId));
    const { number, seriesId } = await docNumber(req, body.firmId, 'adjustment', body.seriesId, body.number);
    const row = await db.transaction(async (tx) => {
      const lines: any[] = [];
      let totalValue = 0;
      const [adj] = await tx.insert(schema.stockAdjustments).values({ tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, seriesId, number, adjustmentDate: body.adjustmentDate, referenceNo: body.referenceNo ?? null, mode: body.mode, note: body.note ?? null, createdBy: req.user.id }).returning();
      for (const l of body.lines) {
        const key = { tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, productItemId: l.productItemId };
        const bal = await getBalance(key, tx as any);
        const nm = names.get(l.productItemId);
        let value = 0;
        if (l.qtyAdjusted > 0) value = (await stockIn(key, { date: body.adjustmentDate, qty: l.qtyAdjusted, rate: l.rate, kind: 'adjust_in', refType: 'adjustment', refId: adj.id, refNumber: number, createdBy: req.user.id }, tx as any)).value;
        else value = -(await stockOut(key, { date: body.adjustmentDate, qty: -l.qtyAdjusted, kind: 'adjust_out', allowNegative: true, refType: 'adjustment', refId: adj.id, refNumber: number, createdBy: req.user.id }, tx as any)).value;
        totalValue += value;
        lines.push({ productItemId: l.productItemId, productName: nm?.productName ?? '', itemName: nm?.itemName ?? '', sku: nm?.sku ?? '', qtyAvailable: bal.qtyOnHand, qtyAdjusted: l.qtyAdjusted, newQty: bal.qtyOnHand + l.qtyAdjusted, rate: l.rate, value });
      }
      const [done] = await tx.update(schema.stockAdjustments).set({ lines, totalValue: s4(totalValue) }).where(eq(schema.stockAdjustments.id, adj.id)).returning();
      return done;
    });
    await logActivity(req, 'stock_adjustment', row.id, 'created', `Stock adjustment ${row.number} created`);
    return ok({ ...row, totalValue: n(row.totalValue) }, 'Stock adjustment created successfully');
  });

  app.delete('/api/accounting/inventory/adjustments/:id', { preHandler: app.requirePermission('acc_stock_adjustment', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    const [r] = await db.select().from(schema.stockAdjustments).where(and(eq(schema.stockAdjustments.id, id), eq(schema.stockAdjustments.tenantId, req.user.tenantId)));
    if (!r) throw notFound('Adjustment');
    await db.transaction(async (tx) => { await reverseRef(req.user.tenantId, 'adjustment', id, tx as any); await tx.delete(schema.stockAdjustments).where(eq(schema.stockAdjustments.id, id)); });
    await logActivity(req, 'stock_adjustment', id, 'deleted', `Stock adjustment ${r.number} deleted`);
    return ok(null, 'Stock adjustment deleted');
  });

  /* ---------------- Stock transfers (firm/branch) ---------------- */
  app.get('/api/accounting/inventory/transfers', { preHandler: app.requirePermission('acc_stock_transfer') }, async (req) => {
    const q = parseListQuery(req.query as any);
    const T = schema.stockTransfers;
    const COLS = tableColumns(T);
    const where = and(eq(T.tenantId, req.user.tenantId), q.firmId ? or(eq(T.firmId, q.firmId), eq(T.toFirmId, q.firmId)) : undefined, filterWhere((req.query as any).filters, COLS), q.search ? or(ilike(T.number, `%${q.search}%`), ilike(T.referenceNo, `%${q.search}%`)) : undefined);
    const [{ total }] = await db.select({ total: count() }).from(T).where(where);
    const rows = await db.select().from(T).where(where).orderBy(sortBy(q.sortBy, q.sortOrder, COLS, T.transferDate)).limit(q.limit).offset((q.page - 1) * q.limit);
    const fb = await db.select({ id: schema.branches.id, name: schema.branches.name, firmName: schema.firms.name }).from(schema.branches).innerJoin(schema.firms, eq(schema.firms.id, schema.branches.firmId)).where(eq(schema.branches.tenantId, req.user.tenantId));
    const label = (bid: string) => { const b = fb.find((x) => x.id === bid); return b ? `${b.firmName} / ${b.name}` : '-'; };
    const users = await db.select({ id: schema.users.id, name: sql<string>`${schema.users.firstName} || ' ' || ${schema.users.lastName}` }).from(schema.users).where(eq(schema.users.tenantId, req.user.tenantId));
    return ok({ rows: rows.map((r) => ({ ...r, totalValue: n(r.totalValue), fromLabel: label(r.branchId), toLabel: label(r.toBranchId), createdByName: users.find((u) => u.id === r.createdBy)?.name })), total: Number(total), page: q.page, pageSize: q.limit });
  });

  app.post('/api/accounting/inventory/transfers', { preHandler: app.requirePermission('acc_stock_transfer', 'create') }, async (req) => {
    const body = parse(stockTransferSchema, req.body);
    const settings = await getSettings(req.user.tenantId);
    const names = await itemNames(body.lines.map((l) => l.productItemId));
    const { number, seriesId } = await docNumber(req, body.firmId, 'stock_transfer', body.seriesId, body.number);
    const approval = settings.stockTransferType === 'approval';
    const row = await db.transaction(async (tx) => {
      const [tr] = await tx.insert(schema.stockTransfers).values({ tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, toFirmId: body.toFirmId, toBranchId: body.toBranchId, seriesId, number, transferDate: body.transferDate, referenceNo: body.referenceNo ?? null, notes: body.notes ?? null, status: approval ? 'pending' : 'completed', createdBy: req.user.id }).returning();
      const lines: any[] = [];
      let totalValue = 0;
      for (const l of body.lines) {
        const nm = names.get(l.productItemId);
        const out = await stockOut({ tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, productItemId: l.productItemId }, { date: body.transferDate, qty: l.qty, kind: 'transfer_out', allowNegative: !!settings.allowedNegativeStockTransfer, refType: 'stock_transfer', refId: tr.id, refNumber: number, createdBy: req.user.id }, tx as any);
        const unitPrice = l.unitPrice || out.avgRate;
        if (!approval) await stockIn({ tenantId: req.user.tenantId, firmId: body.toFirmId, branchId: body.toBranchId, productItemId: l.productItemId }, { date: body.transferDate, qty: l.qty, rate: unitPrice, kind: 'transfer_in', refType: 'stock_transfer', refId: tr.id, refNumber: number, createdBy: req.user.id }, tx as any);
        totalValue += l.qty * unitPrice;
        lines.push({ productItemId: l.productItemId, productName: nm?.productName ?? '', itemName: nm?.itemName ?? '', sku: nm?.sku ?? '', qty: l.qty, unitPrice, total: l.qty * unitPrice });
      }
      const [done] = await tx.update(schema.stockTransfers).set({ lines, totalValue: s4(totalValue) }).where(eq(schema.stockTransfers.id, tr.id)).returning();
      return done;
    });
    await logActivity(req, 'stock_transfer', row.id, 'created', `Stock transfer ${row.number} created`);
    return ok({ ...row, totalValue: n(row.totalValue) }, approval ? 'Transfer created — pending approval at destination' : 'Stock transfer completed');
  });

  /** Approve / reject a pending transfer at the destination */
  app.post('/api/accounting/inventory/transfers/:id/:action', { preHandler: app.requirePermission('acc_stock_transfer', 'update') }, async (req) => {
    const { id, action } = req.params as { id: string; action: 'approve' | 'reject' };
    const [tr] = await db.select().from(schema.stockTransfers).where(and(eq(schema.stockTransfers.id, id), eq(schema.stockTransfers.tenantId, req.user.tenantId)));
    if (!tr) throw notFound('Transfer');
    if (tr.status !== 'pending') throw validation('Transfer is not pending');
    await db.transaction(async (tx) => {
      if (action === 'approve') {
        for (const l of tr.lines) await stockIn({ tenantId: req.user.tenantId, firmId: tr.toFirmId, branchId: tr.toBranchId, productItemId: l.productItemId }, { date: String(tr.transferDate), qty: l.qty, rate: l.unitPrice, kind: 'transfer_in', refType: 'stock_transfer', refId: tr.id, refNumber: tr.number, createdBy: req.user.id }, tx as any);
        await tx.update(schema.stockTransfers).set({ status: 'completed', updatedAt: new Date() }).where(eq(schema.stockTransfers.id, id));
      } else {
        await reverseRef(req.user.tenantId, 'stock_transfer', id, tx as any);
        await tx.update(schema.stockTransfers).set({ status: 'rejected', updatedAt: new Date() }).where(eq(schema.stockTransfers.id, id));
      }
    });
    return ok(null, action === 'approve' ? 'Transfer approved' : 'Transfer rejected — stock returned to source');
  });

  app.delete('/api/accounting/inventory/transfers/:id', { preHandler: app.requirePermission('acc_stock_transfer', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    const [r] = await db.select().from(schema.stockTransfers).where(and(eq(schema.stockTransfers.id, id), eq(schema.stockTransfers.tenantId, req.user.tenantId)));
    if (!r) throw notFound('Transfer');
    await db.transaction(async (tx) => { await reverseRef(req.user.tenantId, 'stock_transfer', id, tx as any); await tx.delete(schema.stockTransfers).where(eq(schema.stockTransfers.id, id)); });
    return ok(null, 'Stock transfer deleted');
  });

  /* ---------------- Product → product transfer ---------------- */
  app.get('/api/accounting/inventory/item-transfers', { preHandler: app.requirePermission('acc_item_transfer') }, async (req) => {
    const q = parseListQuery(req.query as any);
    const T = schema.itemTransfers;
    const where = and(eq(T.tenantId, req.user.tenantId), q.firmId ? eq(T.firmId, q.firmId) : undefined, filterWhere((req.query as any).filters, tableColumns(T)), q.search ? or(ilike(T.number, `%${q.search}%`), ilike(T.referenceNo, `%${q.search}%`)) : undefined);
    const [{ total }] = await db.select({ total: count() }).from(T).where(where);
    const rows = await db.select().from(T).where(where).orderBy(sortBy(q.sortBy, q.sortOrder, tableColumns(T), T.transferDate)).limit(q.limit).offset((q.page - 1) * q.limit);
    return ok({ rows: rows.map((r) => ({ ...r, totalValue: n(r.totalValue) })), total: Number(total), page: q.page, pageSize: q.limit });
  });

  app.post('/api/accounting/inventory/item-transfers', { preHandler: app.requirePermission('acc_item_transfer', 'create') }, async (req) => {
    const body = parse(itemTransferSchema, req.body);
    const names = await itemNames(body.lines.flatMap((l) => [l.fromItemId, l.toItemId]));
    const { number, seriesId } = await docNumber(req, body.firmId, 'item_transfer', body.seriesId, body.number);
    const row = await db.transaction(async (tx) => {
      const [tr] = await tx.insert(schema.itemTransfers).values({ tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, seriesId, number, transferDate: body.transferDate, referenceNo: body.referenceNo ?? null, notes: body.notes ?? null, createdBy: req.user.id }).returning();
      const lines: any[] = [];
      let totalValue = 0;
      for (const l of body.lines) {
        const out = await stockOut({ tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, productItemId: l.fromItemId }, { date: body.transferDate, qty: l.qty, kind: 'transfer_out', refType: 'item_transfer', refId: tr.id, refNumber: number, createdBy: req.user.id }, tx as any);
        const unitPrice = l.unitPrice || out.avgRate;
        await stockIn({ tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, productItemId: l.toItemId }, { date: body.transferDate, qty: l.qty, rate: unitPrice, kind: 'transfer_in', refType: 'item_transfer', refId: tr.id, refNumber: number, createdBy: req.user.id }, tx as any);
        totalValue += l.qty * unitPrice;
        const f = names.get(l.fromItemId), t = names.get(l.toItemId);
        lines.push({ fromItemId: l.fromItemId, fromName: f ? `${f.productName} / ${f.itemName}` : '', toItemId: l.toItemId, toName: t ? `${t.productName} / ${t.itemName}` : '', qty: l.qty, unitPrice, total: l.qty * unitPrice });
      }
      const [done] = await tx.update(schema.itemTransfers).set({ lines, totalValue: s4(totalValue) }).where(eq(schema.itemTransfers.id, tr.id)).returning();
      return done;
    });
    await logActivity(req, 'item_transfer', row.id, 'created', `Product transfer ${row.number} created`);
    return ok({ ...row, totalValue: n(row.totalValue) }, 'Product transfer completed');
  });

  app.delete('/api/accounting/inventory/item-transfers/:id', { preHandler: app.requirePermission('acc_item_transfer', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    const [r] = await db.select().from(schema.itemTransfers).where(and(eq(schema.itemTransfers.id, id), eq(schema.itemTransfers.tenantId, req.user.tenantId)));
    if (!r) throw notFound('Transfer');
    await db.transaction(async (tx) => { await reverseRef(req.user.tenantId, 'item_transfer', id, tx as any); await tx.delete(schema.itemTransfers).where(eq(schema.itemTransfers.id, id)); });
    return ok(null, 'Product transfer deleted');
  });

  /* ---------------- Stock tally (physical count) ---------------- */
  app.get('/api/accounting/inventory/stock-tally', { preHandler: app.requirePermission('acc_stock_tally') }, async (req) => {
    const { firmId, branchId, tallyDate, categoryId, productId, stockType, search } = req.query as Record<string, string | undefined>;
    if (!firmId || !tallyDate) throw validation('Firm and date are required');
    const items = await db
      .select({ i: I, productName: P.name, qty: sql<string>`coalesce((select sum(b.qty_on_hand) from ${B} b where b.product_item_id = ${I.id} and b.firm_id = ${firmId} ${branchId ? sql`and b.branch_id = ${branchId}` : sql``}),0)`, memoOut: sql<string>`coalesce((select sum(b.memo_out) from ${B} b where b.product_item_id = ${I.id} and b.firm_id = ${firmId} ${branchId ? sql`and b.branch_id = ${branchId}` : sql``}),0)`, committed: sql<string>`coalesce((select sum(b.so_committed) from ${B} b where b.product_item_id = ${I.id} and b.firm_id = ${firmId} ${branchId ? sql`and b.branch_id = ${branchId}` : sql``}),0)` })
      .from(I).innerJoin(P, eq(P.id, I.productId))
      .where(and(eq(I.tenantId, req.user.tenantId), eq(I.isActive, true), productId ? eq(I.productId, productId) : undefined, categoryId ? sql`${P.categoryIds} ? ${categoryId}` : undefined, stockType ? inArray(P.stockType, stockType.split(',')) : undefined, search ? or(ilike(I.name, `%${search}%`), ilike(I.sku, `%${search}%`), ilike(I.barcode, `%${search}%`), ilike(P.name, `%${search}%`)) : undefined))
      .orderBy(asc(P.name), asc(I.name));
    const counted = await db.select().from(schema.stockTallies).where(and(eq(schema.stockTallies.firmId, firmId), eq(schema.stockTallies.tallyDate, tallyDate), branchId ? eq(schema.stockTallies.branchId, branchId) : undefined));
    const rows = items.map((r) => { const c = counted.find((x) => x.productItemId === r.i.id); return { productItemId: r.i.id, productName: r.productName, itemName: r.i.name, sku: r.i.sku, barcode: r.i.barcode, systemQty: n(r.qty), memoOut: n(r.memoOut), committed: n(r.committed), availableForSale: n(r.qty) - n(r.memoOut) - n(r.committed), countedQty: c ? n(c.countedQty) : null, counted: !!c, matched: c ? Math.abs(n(c.countedQty) - n(r.qty)) < 0.00005 : false }; });
    const pending = rows.filter((r) => !r.counted), done = rows.filter((r) => r.counted);
    return ok({ pending, counted: done, summary: { total: rows.length, counted: done.length, matched: done.filter((r) => r.matched).length, extra: done.filter((r) => !r.matched).length } });
  });

  app.put('/api/accounting/inventory/stock-tally', { preHandler: app.requirePermission('acc_stock_tally', 'update') }, async (req) => {
    const body = parse(stockTallySchema, req.body);
    for (const c of body.counts) {
      const bal = await db.select({ q: sql<string>`coalesce(sum(${B.qtyOnHand}),0)` }).from(B).where(and(eq(B.productItemId, c.productItemId), eq(B.firmId, body.firmId), body.branchId ? eq(B.branchId, body.branchId) : undefined));
      await db.insert(schema.stockTallies).values({ tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId ?? null, tallyDate: body.tallyDate, productItemId: c.productItemId, countedQty: s4(c.countedQty), systemQty: s4(n(bal[0]?.q)), countedBy: req.user.id }).onConflictDoUpdate({ target: [schema.stockTallies.firmId, schema.stockTallies.tallyDate, schema.stockTallies.productItemId], set: { countedQty: s4(c.countedQty), systemQty: s4(n(bal[0]?.q)), countedBy: req.user.id, branchId: body.branchId ?? null } });
    }
    return ok({ saved: body.counts.length }, 'Count saved');
  });
  app.delete('/api/accounting/inventory/stock-tally', { preHandler: app.requirePermission('acc_stock_tally', 'delete') }, async (req) => {
    const { firmId, tallyDate, branchId } = req.query as Record<string, string | undefined>;
    if (!firmId || !tallyDate) throw validation('Firm and date are required');
    await db.delete(schema.stockTallies).where(and(eq(schema.stockTallies.tenantId, req.user.tenantId), eq(schema.stockTallies.firmId, firmId), eq(schema.stockTallies.tallyDate, tallyDate), branchId ? eq(schema.stockTallies.branchId, branchId) : undefined));
    return ok(null, "This date's count cleared");
  });
}
