import type { FastifyInstance } from 'fastify';
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { certifiedProductSchema, holdSchema, CERTIFIED_STATUS_LABELS } from '@diamondbill/shared';
import { parse } from '../lib/validate';
import { notFound, validation } from '../lib/errors';
import { ok } from '../lib/respond';
import { parseListQuery } from '../lib/list';
import { filterWhere, sortBy, tableColumns } from '../lib/filters';
import { logActivity } from '../services/activity';
import { stockIn, reverseRef, getBalance } from '../services/stock';
import { applyNameTemplate, nameTemplateFor, nextSku, shapeItem } from './products';

const s4 = (v: unknown) => (v == null ? null : Number(v).toFixed(4));
const today = () => new Date().toISOString().slice(0, 10);

/** price/ct from Rapaport list and back % (negative back = premium) */
export const rapPrice = (rap: number | null | undefined, back: number | null | undefined) => (rap == null ? null : rap * (1 - Number(back ?? 0) / 100));

export async function certifiedRoutes(app: FastifyInstance) {
  const I = schema.productItems, P = schema.products;
  const COLS = { ...tableColumns(I), productName: P.name, hsnCode: P.hsnCode, firmName: schema.firms.name, branchName: schema.branches.name, labName: schema.labs.labName, taxName: schema.taxGroups.name, unitName: schema.units.name, holdCustomerName: sql`hc.company_name`, holdBrokerName: sql`hb.company_name` };

  /** List single stones with stock + KPIs */
  app.get('/api/accounting/certified-products', { preHandler: app.requirePermission('acc_certified_stock') }, async (req) => {
    const q = parseListQuery(req.query as any);
    const { status, tab, labId, holdCustomerId } = req.query as Record<string, string | undefined>;
    const hc = sql`hc`, hb = sql`hb`;
    const where = and(
      eq(I.tenantId, req.user.tenantId),
      eq(P.stockType, 'certified'),
      q.firmId ? eq(I.firmId, q.firmId) : undefined,
      q.branchId ? eq(I.branchId, q.branchId) : undefined,
      status ? inArray(I.status, status.split(',')) : undefined,
      tab === 'on_hold' ? eq(I.status, 'on_hold') : tab === 'sale' ? eq(I.status, 'sold') : tab === 'purchase' ? sql`exists (select 1 from ${schema.stockMovements} m where m.product_item_id = ${I.id} and m.ref_type in ('purchase_bill','opening'))` : undefined,
      labId ? eq(I.labId, labId) : undefined,
      holdCustomerId ? eq(I.holdCustomerId, holdCustomerId) : undefined,
      filterWhere((req.query as any).filters, COLS as any),
      q.search ? or(ilike(I.sku, `%${q.search}%`), ilike(I.name, `%${q.search}%`), ilike(I.certificateNo, `%${q.search}%`), sql`${I.customFields}::text ilike ${'%' + q.search + '%'}`) : undefined,
    );
    const base = () =>
      db
        .select({ i: I, productName: P.name, hsnCode: P.hsnCode, taxGroupId: P.taxGroupId, unitId: P.unitId, currency: P.currency, categoryIds: P.categoryIds, salesAccountId: P.salesAccountId, purchaseAccountId: P.purchaseAccountId, firmName: schema.firms.name, branchName: schema.branches.name, labName: schema.labs.labName, taxName: schema.taxGroups.name, unitName: schema.units.name, holdCustomerName: sql<string>`hc.company_name`, holdBrokerName: sql<string>`hb.company_name`, qtyOnHand: sql<string>`coalesce(b.qty_on_hand,0)`, memoOut: sql<string>`coalesce(b.memo_out,0)`, memoIn: sql<string>`coalesce(b.memo_in,0)`, soCommitted: sql<string>`coalesce(b.so_committed,0)`, stockValue: sql<string>`coalesce(b.value,0)` })
        .from(I)
        .innerJoin(P, eq(P.id, I.productId))
        .leftJoin(schema.firms, eq(schema.firms.id, I.firmId))
        .leftJoin(schema.branches, eq(schema.branches.id, I.branchId))
        .leftJoin(schema.labs, eq(schema.labs.id, I.labId))
        .leftJoin(schema.taxGroups, eq(schema.taxGroups.id, P.taxGroupId))
        .leftJoin(schema.units, eq(schema.units.id, P.unitId))
        .leftJoin(sql`${schema.contacts} as hc`, sql`hc.id = ${I.holdCustomerId}`)
        .leftJoin(sql`${schema.contacts} as hb`, sql`hb.id = ${I.holdBrokerId}`)
        .leftJoin(sql`${schema.stockBalances} as b`, sql`b.product_item_id = ${I.id} and b.firm_id = ${I.firmId} and b.branch_id = ${I.branchId}`);
    void hc; void hb;
    const [{ total }] = await db.select({ total: count() }).from(I).innerJoin(P, eq(P.id, I.productId)).leftJoin(schema.firms, eq(schema.firms.id, I.firmId)).leftJoin(schema.branches, eq(schema.branches.id, I.branchId)).leftJoin(schema.labs, eq(schema.labs.id, I.labId)).leftJoin(schema.taxGroups, eq(schema.taxGroups.id, P.taxGroupId)).leftJoin(schema.units, eq(schema.units.id, P.unitId)).leftJoin(sql`${schema.contacts} as hc`, sql`hc.id = ${I.holdCustomerId}`).leftJoin(sql`${schema.contacts} as hb`, sql`hb.id = ${I.holdBrokerId}`).where(where);
    const rows = await base().where(where).orderBy(sortBy(q.sortBy, q.sortOrder, COLS as any, I.createdAt)).limit(q.limit).offset((q.page - 1) * q.limit);
    // KPIs over the whole filtered set (no pagination)
    const [k] = await db
      .select({ total: count(), stock: sql<string>`coalesce(sum(case when ${I.status} in ('available','on_hold','in_process','lab') then 1 else 0 end),0)`, memo: sql<string>`coalesce(sum(case when ${I.status}='memo' then 1 else 0 end),0)`, weight: sql<string>`coalesce(sum(${I.weight}),0)`, value: sql<string>`coalesce(sum(coalesce(${I.pricePerCarat}, ${I.sellingPrice}) * coalesce(${I.weight},0)),0)` })
      .from(I).innerJoin(P, eq(P.id, I.productId)).leftJoin(schema.firms, eq(schema.firms.id, I.firmId)).leftJoin(schema.branches, eq(schema.branches.id, I.branchId)).leftJoin(schema.labs, eq(schema.labs.id, I.labId)).leftJoin(schema.taxGroups, eq(schema.taxGroups.id, P.taxGroupId)).leftJoin(schema.units, eq(schema.units.id, P.unitId)).leftJoin(sql`${schema.contacts} as hc`, sql`hc.id = ${I.holdCustomerId}`).leftJoin(sql`${schema.contacts} as hb`, sql`hb.id = ${I.holdBrokerId}`).where(where);
    const list = rows.map((r) => shapeStone(r));
    return ok({ rows: list, total: Number(total), page: q.page, pageSize: q.limit, kpis: { total: Number(k.total), stock: Number(k.stock), memo: Number(k.memo), weight: Number(k.weight), netValue: Number(k.value), netRate: Number(k.weight) ? Number(k.value) / Number(k.weight) : 0 } }, 'Certified products retrieved successfully');
  });

  app.get('/api/accounting/certified-products/:id', { preHandler: app.requirePermission('acc_certified_stock') }, async (req) => {
    const { id } = req.params as { id: string };
    const [r] = await db.select({ i: I, p: P }).from(I).innerJoin(P, eq(P.id, I.productId)).where(and(eq(I.id, id), eq(I.tenantId, req.user.tenantId)));
    if (!r) throw notFound('Certified product');
    const bal = r.i.firmId && r.i.branchId ? await getBalance({ tenantId: req.user.tenantId, firmId: r.i.firmId, branchId: r.i.branchId, productItemId: r.i.id }) : null;
    return ok({ ...shapeItem(r.i), product: r.p, productName: r.p.name, hsnCode: r.p.hsnCode, taxGroupId: r.p.taxGroupId, unitId: r.p.unitId, currency: r.p.currency, categoryIds: r.p.categoryIds, salesAccountId: r.p.salesAccountId, purchaseAccountId: r.p.purchaseAccountId, description: r.i.description, stock: bal });
  });

  app.post('/api/accounting/certified-products', { preHandler: app.requirePermission('acc_certified_stock', 'create') }, async (req) => {
    const body = parse(certifiedProductSchema, req.body);
    const tpl = await nameTemplateFor(req.user.tenantId, 'certified');
    const sku = body.sku.trim();
    const [dup] = await db.select({ id: I.id }).from(I).where(and(eq(I.tenantId, req.user.tenantId), eq(I.sku, sku)));
    if (dup) throw validation(`SKU "${sku}" already exists`);
    const ctx = { productName: body.name?.trim() || stoneTitle(body.customFields, body.weight), productCode: sku, hsnCode: body.hsnCode, description: body.description, stockId: sku, barcode: sku, serial: 1 };
    const productName = body.name?.trim() || applyNameTemplate(tpl.productTemplate, ctx) || ctx.productName;
    const itemName = body.itemName?.trim() || applyNameTemplate(tpl.subProductTemplate, { ...ctx, productName }) || productName;
    const pricePerCarat = body.sellingPrice || rapPrice(body.rapaportPrice, body.rapBack) || 0;
    const item = await db.transaction(async (tx) => {
      const [p] = await tx.insert(P).values({ tenantId: req.user.tenantId, name: productName, productType: 'goods', stockType: 'certified', unitId: body.unitId || null, hsnCode: body.hsnCode ?? null, categoryIds: body.categoryIds, trackingType: 'serialized', purchaseAccountId: body.purchaseAccountId, salesAccountId: body.salesAccountId, purchasePrice: s4(body.purchasePrice)!, sellingPrice: s4(pricePerCarat)!, currency: body.currency, taxGroupId: body.taxGroupId || null, stockStatus: body.stockStatus, shortDescription: body.description ?? null, createdBy: req.user.id }).returning();
      const [it] = await tx.insert(I).values({ tenantId: req.user.tenantId, productId: p.id, name: itemName, sku, isDefault: true, purchasePrice: s4(body.purchasePrice)!, sellingPrice: s4(pricePerCarat)!, firmId: body.firmId, branchId: body.branchId, weight: s4(body.weight)!, labId: body.labId || null, certificateNo: body.certificateNo ?? null, rapaportPrice: s4(body.rapaportPrice), rapBack: s4(body.rapBack), pricePerCarat: s4(pricePerCarat), discountType: body.discountType, discountValue: s4(body.discountValue)!, status: body.addStock ? 'available' : 'disabled', description: body.description ?? null, customFields: body.customFields }).returning();
      if (body.addStock) await stockIn({ tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, productItemId: it.id }, { date: body.stockDate || today(), qty: body.weight, rate: body.purchasePrice, refType: 'opening', refId: it.id, refNumber: sku, note: 'Certified stone added to stock', createdBy: req.user.id }, tx as any);
      return it;
    });
    await logActivity(req, 'certified_product', item.id, 'created', `Stone "${sku}" added`);
    return ok({ ...shapeItem(item), productItemId: item.id }, 'Certified product created successfully');
  });

  app.put('/api/accounting/certified-products/:id', { preHandler: app.requirePermission('acc_certified_stock', 'update') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(certifiedProductSchema.partial(), req.body);
    const [existing] = await db.select().from(I).where(and(eq(I.id, id), eq(I.tenantId, req.user.tenantId)));
    if (!existing) throw notFound('Certified product');
    if (body.sku && body.sku !== existing.sku) {
      const [dup] = await db.select({ id: I.id }).from(I).where(and(eq(I.tenantId, req.user.tenantId), eq(I.sku, body.sku)));
      if (dup) throw validation(`SKU "${body.sku}" already exists`);
    }
    const rap = body.rapaportPrice !== undefined ? body.rapaportPrice : existing.rapaportPrice == null ? null : Number(existing.rapaportPrice);
    const back = body.rapBack !== undefined ? body.rapBack : existing.rapBack == null ? null : Number(existing.rapBack);
    const pricePerCarat = body.sellingPrice ?? (rapPrice(rap, back) ?? Number(existing.pricePerCarat ?? existing.sellingPrice));
    const item = await db.transaction(async (tx) => {
      const pPatch: any = { updatedAt: new Date() };
      if (body.name) pPatch.name = body.name;
      for (const k of ['hsnCode', 'categoryIds', 'stockStatus', 'currency'] as const) if (body[k] !== undefined) pPatch[k] = body[k];
      for (const k of ['unitId', 'taxGroupId', 'salesAccountId', 'purchaseAccountId'] as const) if (body[k] !== undefined) pPatch[k] = body[k] || null;
      if (body.purchasePrice !== undefined) pPatch.purchasePrice = s4(body.purchasePrice);
      pPatch.sellingPrice = s4(pricePerCarat);
      await tx.update(P).set(pPatch).where(eq(P.id, existing.productId));
      const iPatch: any = { updatedAt: new Date(), pricePerCarat: s4(pricePerCarat), sellingPrice: s4(pricePerCarat) };
      if (body.itemName) iPatch.name = body.itemName;
      if (body.sku) iPatch.sku = body.sku;
      for (const k of ['firmId', 'branchId', 'certificateNo', 'discountType', 'description', 'customFields'] as const) if (body[k] !== undefined) iPatch[k] = body[k];
      if (body.labId !== undefined) iPatch.labId = body.labId || null;
      if (body.purchasePrice !== undefined) iPatch.purchasePrice = s4(body.purchasePrice);
      if (body.weight !== undefined) iPatch.weight = s4(body.weight);
      if (body.rapaportPrice !== undefined) iPatch.rapaportPrice = s4(body.rapaportPrice);
      if (body.rapBack !== undefined) iPatch.rapBack = s4(body.rapBack);
      if (body.discountValue !== undefined) iPatch.discountValue = s4(body.discountValue);
      const [it] = await tx.update(I).set(iPatch).where(eq(I.id, id)).returning();
      return it;
    });
    await logActivity(req, 'certified_product', id, 'updated', `Stone "${item.sku}" updated`);
    return ok(shapeItem(item), 'Certified product updated successfully');
  });

  app.delete('/api/accounting/certified-products/:id', { preHandler: app.requirePermission('acc_certified_stock', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    const [existing] = await db.select().from(I).where(and(eq(I.id, id), eq(I.tenantId, req.user.tenantId)));
    if (!existing) throw notFound('Certified product');
    const [other] = await db.select({ n: count() }).from(schema.stockMovements).where(and(eq(schema.stockMovements.productItemId, id), sql`${schema.stockMovements.refType} <> 'opening'`));
    if (Number(other.n) > 0) throw validation('This stone has transactions — it cannot be deleted');
    await db.transaction(async (tx) => {
      await reverseRef(req.user.tenantId, 'opening', id, tx as any);
      await tx.delete(P).where(eq(P.id, existing.productId)); // cascades to item
    });
    await logActivity(req, 'certified_product', id, 'deleted', `Stone "${existing.sku}" deleted`);
    return ok(null, 'Certified product deleted successfully');
  });

  /** Hold / release for a customer (and optional broker) */
  app.post('/api/accounting/certified-products/:id/hold', { preHandler: app.requirePermission('acc_certified_stock', 'update') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(holdSchema, req.body);
    const [it] = await db.select().from(I).where(and(eq(I.id, id), eq(I.tenantId, req.user.tenantId)));
    if (!it) throw notFound('Certified product');
    if (it.status !== 'available') throw validation(`Stone is ${CERTIFIED_STATUS_LABELS[it.status as keyof typeof CERTIFIED_STATUS_LABELS] ?? it.status} — only available stones can be put on hold`);
    const [row] = await db.update(I).set({ status: 'on_hold', holdCustomerId: body.holdCustomerId || null, holdBrokerId: body.holdBrokerId || null, updatedAt: new Date() }).where(eq(I.id, id)).returning();
    await logActivity(req, 'certified_product', id, 'hold', `Stone "${it.sku}" put on hold`, { note: body.note });
    return ok(shapeItem(row), 'Stone put on hold');
  });
  app.post('/api/accounting/certified-products/:id/release', { preHandler: app.requirePermission('acc_certified_stock', 'update') }, async (req) => {
    const { id } = req.params as { id: string };
    const [it] = await db.select().from(I).where(and(eq(I.id, id), eq(I.tenantId, req.user.tenantId)));
    if (!it) throw notFound('Certified product');
    if (it.status !== 'on_hold') throw validation('Stone is not on hold');
    const [row] = await db.update(I).set({ status: 'available', holdCustomerId: null, holdBrokerId: null, updatedAt: new Date() }).where(eq(I.id, id)).returning();
    await logActivity(req, 'certified_product', id, 'release', `Stone "${it.sku}" released from hold`);
    return ok(shapeItem(row), 'Stone released');
  });

  /** Bulk: hold/release/status for selected ids */
  app.post('/api/accounting/certified-products/bulk', { preHandler: app.requirePermission('acc_certified_stock', 'update') }, async (req) => {
    const { ids, action, holdCustomerId, holdBrokerId } = (req.body ?? {}) as { ids: string[]; action: 'hold' | 'release' | 'disable' | 'enable'; holdCustomerId?: string; holdBrokerId?: string };
    if (!ids?.length) throw validation('No stones selected');
    const patch: any = { updatedAt: new Date() };
    if (action === 'hold') Object.assign(patch, { status: 'on_hold', holdCustomerId: holdCustomerId || null, holdBrokerId: holdBrokerId || null });
    else if (action === 'release') Object.assign(patch, { status: 'available', holdCustomerId: null, holdBrokerId: null });
    else if (action === 'disable') patch.status = 'disabled';
    else if (action === 'enable') patch.status = 'available';
    const rows = await db.update(I).set(patch).where(and(eq(I.tenantId, req.user.tenantId), inArray(I.id, ids), action === 'hold' ? eq(I.status, 'available') : action === 'release' ? eq(I.status, 'on_hold') : undefined)).returning({ id: I.id });
    return ok({ updated: rows.length }, `${rows.length} stone(s) updated`);
  });

  app.get('/api/accounting/certified-products/next-sku', { preHandler: app.authenticate }, async (req) => ok({ sku: await nextSku(req.user.tenantId, 'CERT-') }));
  void asc; void desc;
}

/** "Round 1.02ct G VS1" from custom fields */
function stoneTitle(cf: Record<string, unknown>, weight: number) {
  const g = (k: string) => (cf[k] == null || cf[k] === '' ? '' : String(cf[k]).replace(/_/g, ' ').toUpperCase());
  return [titleCase(g('shape')), `${Number(weight).toFixed(2)}ct`, g('color'), g('clarity')].filter(Boolean).join(' ');
}
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function shapeStone(r: any) {
  const i = r.i as typeof schema.productItems.$inferSelect;
  const weight = i.weight == null ? 0 : Number(i.weight);
  const pricePerCarat = i.pricePerCarat == null ? Number(i.sellingPrice) : Number(i.pricePerCarat);
  const disc = Number(i.discountValue);
  const netPerCarat = i.discountType === 'percent' ? pricePerCarat * (1 - disc / 100) : pricePerCarat - disc;
  return {
    ...shapeItem(i),
    productName: r.productName, hsnCode: r.hsnCode, taxGroupId: r.taxGroupId, unitId: r.unitId, currency: r.currency, categoryIds: r.categoryIds, salesAccountId: r.salesAccountId, purchaseAccountId: r.purchaseAccountId,
    firmName: r.firmName, branchName: r.branchName, labName: r.labName, taxName: r.taxName, unitName: r.unitName, holdCustomerName: r.holdCustomerName, holdBrokerName: r.holdBrokerName,
    statusLabel: CERTIFIED_STATUS_LABELS[i.status as keyof typeof CERTIFIED_STATUS_LABELS] ?? i.status,
    pricePerCarat, netPerCarat, totalSalesPrice: netPerCarat * weight, totalPurchasePrice: Number(i.purchasePrice) * weight,
    stock: { qtyOnHand: Number(r.qtyOnHand), memoOut: Number(r.memoOut), memoIn: Number(r.memoIn), soCommitted: Number(r.soCommitted), value: Number(r.stockValue), saleable: Number(r.qtyOnHand) - Number(r.memoOut) - Number(r.soCommitted) },
  };
}
