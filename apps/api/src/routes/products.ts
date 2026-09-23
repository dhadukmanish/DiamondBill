import type { FastifyInstance } from 'fastify';
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { productSchema, productItemSchema } from '@diamondbill/shared';
import { parse } from '../lib/validate';
import { notFound, validation } from '../lib/errors';
import { ok } from '../lib/respond';
import { parseListQuery } from '../lib/list';
import { filterWhere, sortBy, tableColumns } from '../lib/filters';
import { logActivity } from '../services/activity';

const s4 = (v: unknown) => (v == null ? undefined : Number(v).toFixed(4));

/** Resolve ##Token## placeholders of a product-name template. */
export function applyNameTemplate(template: string, ctx: Record<string, unknown>) {
  const map: Record<string, unknown> = { 'Product Name': ctx.productName, 'Product Code': ctx.productCode, 'HSN Code': ctx.hsnCode, Description: ctx.description, 'Stock Id': ctx.stockId, Barcode: ctx.barcode, Serial: ctx.serial };
  return template.replace(/##([^#]+)##/g, (_, k) => String(map[k] ?? ctx[k] ?? '')).replace(/\s+-\s*$/, '').trim();
}

export async function nameTemplateFor(tenantId: string, stockType: string) {
  const [t] = await db.select().from(schema.productNameTemplates).where(and(eq(schema.productNameTemplates.tenantId, tenantId), eq(schema.productNameTemplates.stockType, stockType)));
  return t ?? { productTemplate: '##Product Name##', subProductTemplate: '##Product Name## - ##Serial##' };
}

/** Next SKU for a tenant (numeric suffix). */
export async function nextSku(tenantId: string, prefix = 'SKU-') {
  const [r] = await db.select({ max: sql<string>`max(nullif(regexp_replace(${schema.productItems.sku}, '\\D', '', 'g'), ''))::bigint` }).from(schema.productItems).where(and(eq(schema.productItems.tenantId, tenantId), ilike(schema.productItems.sku, `${prefix}%`)));
  return `${prefix}${String(Number(r?.max ?? 0) + 1).padStart(4, '0')}`;
}

export async function productRoutes(app: FastifyInstance) {
  const COLS = { ...tableColumns(schema.products), unitName: schema.units.name };

  /** List with aggregated stock (all firms/branches) */
  app.get('/api/accounting/products', { preHandler: app.requirePermission('acc_products') }, async (req) => {
    const q = parseListQuery(req.query as any);
    const { stockType, productType, categoryId, stockStatus } = req.query as Record<string, string | undefined>;
    const where = and(
      eq(schema.products.tenantId, req.user.tenantId),
      stockType ? inArray(schema.products.stockType, stockType.split(',')) : undefined,
      productType ? eq(schema.products.productType, productType) : undefined,
      stockStatus ? eq(schema.products.stockStatus, stockStatus) : undefined,
      categoryId ? sql`${schema.products.categoryIds} ? ${categoryId}` : undefined,
      filterWhere((req.query as any).filters, COLS),
      q.search ? or(ilike(schema.products.name, `%${q.search}%`), ilike(schema.products.hsnCode, `%${q.search}%`), sql`exists (select 1 from ${schema.productItems} pi where pi.product_id = ${schema.products.id} and pi.sku ilike ${'%' + q.search + '%'})`) : undefined,
    );
    const [{ total }] = await db.select({ total: count() }).from(schema.products).leftJoin(schema.units, eq(schema.units.id, schema.products.unitId)).where(where);
    const rows = await db
      .select({
        p: schema.products,
        unitName: schema.units.name,
        stockQty: sql<string>`coalesce((select sum(b.qty_on_hand) from ${schema.stockBalances} b join ${schema.productItems} i on i.id = b.product_item_id where i.product_id = ${schema.products.id}),0)`,
        stockValue: sql<string>`coalesce((select sum(b.value) from ${schema.stockBalances} b join ${schema.productItems} i on i.id = b.product_item_id where i.product_id = ${schema.products.id}),0)`,
        itemCount: sql<number>`(select count(*) from ${schema.productItems} i where i.product_id = ${schema.products.id})`,
      })
      .from(schema.products)
      .leftJoin(schema.units, eq(schema.units.id, schema.products.unitId))
      .where(where)
      .orderBy(sortBy(q.sortBy, q.sortOrder, COLS, schema.products.createdAt))
      .limit(q.limit)
      .offset((q.page - 1) * q.limit);
    return ok({ rows: rows.map((r) => shapeProduct(r.p, { unitName: r.unitName, stockQty: Number(r.stockQty), stockValue: Number(r.stockValue), itemCount: Number(r.itemCount), avgRate: Number(r.stockQty) ? Number(r.stockValue) / Number(r.stockQty) : 0 })), total: Number(total), page: q.page, pageSize: q.limit }, 'Products retrieved successfully');
  });

  app.get('/api/accounting/products/next-serial', { preHandler: app.authenticate }, async (req) => {
    const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${schema.products.serialNo}),0)` }).from(schema.products).where(eq(schema.products.tenantId, req.user.tenantId));
    return ok({ serialNo: Number(max) + 1, sku: await nextSku(req.user.tenantId) });
  });

  app.get('/api/accounting/products/:id', { preHandler: app.requirePermission('acc_products') }, async (req) => {
    const { id } = req.params as { id: string };
    const [p] = await db.select().from(schema.products).where(and(eq(schema.products.id, id), eq(schema.products.tenantId, req.user.tenantId)));
    if (!p) throw notFound('Product');
    const items = await db.select().from(schema.productItems).where(eq(schema.productItems.productId, id)).orderBy(desc(schema.productItems.isDefault), asc(schema.productItems.createdAt));
    const balances = items.length ? await db.select().from(schema.stockBalances).where(inArray(schema.stockBalances.productItemId, items.map((i) => i.id))) : [];
    return ok({ ...shapeProduct(p), items: items.map((i) => shapeItem(i, balances.filter((b) => b.productItemId === i.id))) });
  });

  app.post('/api/accounting/products', { preHandler: app.requirePermission('acc_products', 'create') }, async (req) => {
    const body = parse(productSchema, req.body);
    const { items, ...rest } = body;
    const tpl = await nameTemplateFor(req.user.tenantId, body.stockType);
    const row = await db.transaction(async (tx) => {
      const [p] = await tx.insert(schema.products).values({ ...toProductRow(rest), tenantId: req.user.tenantId, createdBy: req.user.id }).returning();
      const list = items.length ? items : [{ name: '', sku: '', purchasePrice: rest.purchasePrice, sellingPrice: rest.sellingPrice, isDefault: true, isActive: true, customFields: {}, mrp: null, barcode: null }];
      let serial = 1;
      for (const it of list) {
        const sku = it.sku?.trim() || (await nextSku(req.user.tenantId));
        const name = it.name?.trim() || applyNameTemplate(tpl.subProductTemplate, { productName: p.name, productCode: sku, hsnCode: p.hsnCode, description: p.shortDescription, stockId: sku, barcode: it.barcode, serial: serial++ });
        await tx.insert(schema.productItems).values({ tenantId: req.user.tenantId, productId: p.id, name, sku, barcode: it.barcode ?? null, isDefault: !!it.isDefault || list.length === 1, purchasePrice: s4(it.purchasePrice ?? rest.purchasePrice)!, sellingPrice: s4(it.sellingPrice ?? rest.sellingPrice)!, mrp: s4(it.mrp ?? null) ?? null, isActive: it.isActive ?? true, customFields: it.customFields ?? {} });
      }
      return p;
    });
    await logActivity(req, 'product', row.id, 'created', `Product "${row.name}" created`);
    return ok(shapeProduct(row), 'Product created successfully');
  });

  app.put('/api/accounting/products/:id', { preHandler: app.requirePermission('acc_products', 'update') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(productSchema.partial(), req.body);
    const { items, ...rest } = body;
    const [existing] = await db.select().from(schema.products).where(and(eq(schema.products.id, id), eq(schema.products.tenantId, req.user.tenantId)));
    if (!existing) throw notFound('Product');
    const row = await db.transaction(async (tx) => {
      const [p] = await tx.update(schema.products).set({ ...toProductRow(rest as any), updatedAt: new Date() }).where(eq(schema.products.id, id)).returning();
      if (items) {
        const current = await tx.select().from(schema.productItems).where(eq(schema.productItems.productId, id));
        const keep = new Set(items.filter((i) => i.id).map((i) => i.id));
        for (const c of current) {
          if (!keep.has(c.id)) {
            const [bal] = await tx.select().from(schema.stockBalances).where(and(eq(schema.stockBalances.productItemId, c.id), sql`${schema.stockBalances.qtyOnHand} <> 0`));
            if (bal) throw validation(`Sub-product "${c.name}" still has stock and cannot be removed`);
            await tx.delete(schema.productItems).where(eq(schema.productItems.id, c.id));
          }
        }
        for (const it of items) {
          const vals = { name: it.name, sku: it.sku, barcode: it.barcode ?? null, isDefault: !!it.isDefault, purchasePrice: s4(it.purchasePrice)!, sellingPrice: s4(it.sellingPrice)!, mrp: s4(it.mrp ?? null) ?? null, isActive: it.isActive ?? true, customFields: it.customFields ?? {} };
          if (it.id) await tx.update(schema.productItems).set({ ...vals, updatedAt: new Date() }).where(eq(schema.productItems.id, it.id));
          else await tx.insert(schema.productItems).values({ ...vals, tenantId: req.user.tenantId, productId: id, sku: it.sku || (await nextSku(req.user.tenantId)) });
        }
      }
      return p;
    });
    await logActivity(req, 'product', row.id, 'updated', `Product "${row.name}" updated`);
    return ok(shapeProduct(row), 'Product updated successfully');
  });

  app.delete('/api/accounting/products/:id', { preHandler: app.requirePermission('acc_products', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    const [existing] = await db.select().from(schema.products).where(and(eq(schema.products.id, id), eq(schema.products.tenantId, req.user.tenantId)));
    if (!existing) throw notFound('Product');
    const [used] = await db.select({ n: count() }).from(schema.stockMovements).innerJoin(schema.productItems, eq(schema.productItems.id, schema.stockMovements.productItemId)).where(eq(schema.productItems.productId, id));
    if (Number(used.n) > 0) throw validation('This product has stock movements — mark it inactive instead of deleting');
    await db.delete(schema.products).where(eq(schema.products.id, id));
    await logActivity(req, 'product', id, 'deleted', `Product "${existing.name}" deleted`);
    return ok(null, 'Product deleted successfully');
  });

  /** Item lookup for document lines / pickers: ?search=&stockType=&firmId=&branchId= */
  app.get('/api/accounting/products/items/lookup', { preHandler: app.authenticate }, async (req) => {
    const { search, stockType, firmId, branchId, limit } = req.query as Record<string, string | undefined>;
    const rows = await db
      .select({ i: schema.productItems, productName: schema.products.name, stockType: schema.products.stockType, unitId: schema.products.unitId, taxGroupId: schema.products.taxGroupId, hsnCode: schema.products.hsnCode, currency: schema.products.currency })
      .from(schema.productItems)
      .innerJoin(schema.products, eq(schema.products.id, schema.productItems.productId))
      .where(and(eq(schema.productItems.tenantId, req.user.tenantId), eq(schema.productItems.isActive, true), eq(schema.products.isActive, true), stockType ? inArray(schema.products.stockType, stockType.split(',')) : undefined, search ? or(ilike(schema.productItems.name, `%${search}%`), ilike(schema.productItems.sku, `%${search}%`), ilike(schema.products.name, `%${search}%`)) : undefined))
      .orderBy(asc(schema.products.name), asc(schema.productItems.name))
      .limit(Math.min(500, Number(limit ?? 100)));
    const ids = rows.map((r) => r.i.id);
    const balances = ids.length && firmId && branchId ? await db.select().from(schema.stockBalances).where(and(inArray(schema.stockBalances.productItemId, ids), eq(schema.stockBalances.firmId, firmId), eq(schema.stockBalances.branchId, branchId))) : [];
    return ok(rows.map((r) => { const b = balances.find((x) => x.productItemId === r.i.id); return { id: r.i.id, productId: r.i.productId, productName: r.productName, name: r.i.name, sku: r.i.sku, stockType: r.stockType, unitId: r.unitId, taxGroupId: r.taxGroupId, hsnCode: r.hsnCode, currency: r.currency, purchasePrice: Number(r.i.purchasePrice), sellingPrice: Number(r.i.sellingPrice), weight: r.i.weight == null ? null : Number(r.i.weight), status: r.i.status, qtyOnHand: Number(b?.qtyOnHand ?? 0), saleable: Number(b?.qtyOnHand ?? 0) - Number(b?.memoOut ?? 0) - Number(b?.soCommitted ?? 0), display: `${r.i.sku} · ${r.i.name}` }; }));
  });

  /** Stock ledger of one item */
  app.get('/api/accounting/products/items/:id/movements', { preHandler: app.requirePermission('acc_stock_view') }, async (req) => {
    const { id } = req.params as { id: string };
    const rows = await db.select().from(schema.stockMovements).where(and(eq(schema.stockMovements.tenantId, req.user.tenantId), eq(schema.stockMovements.productItemId, id))).orderBy(desc(schema.stockMovements.movementDate), desc(schema.stockMovements.createdAt)).limit(500);
    return ok(rows.map((m) => ({ ...m, qty: Number(m.qty), rate: Number(m.rate), value: Number(m.value) })));
  });
}

function toProductRow(b: Record<string, any>) {
  const out: any = { ...b };
  for (const k of ['purchasePrice', 'sellingPrice', 'lowStockQty']) if (b[k] !== undefined) out[k] = b[k] == null ? null : s4(b[k]);
  for (const k of ['unitId', 'purchaseAccountId', 'salesAccountId', 'taxGroupId']) if (b[k] !== undefined) out[k] = b[k] || null;
  return out;
}
export function shapeProduct(p: typeof schema.products.$inferSelect, extra: Record<string, unknown> = {}) {
  return { ...p, purchasePrice: Number(p.purchasePrice), sellingPrice: Number(p.sellingPrice), lowStockQty: p.lowStockQty == null ? null : Number(p.lowStockQty), ...extra };
}
export function shapeItem(i: typeof schema.productItems.$inferSelect, balances: (typeof schema.stockBalances.$inferSelect)[] = []) {
  const sum = (k: keyof typeof schema.stockBalances.$inferSelect) => balances.reduce((s, b) => s + Number(b[k] ?? 0), 0);
  const qtyOnHand = sum('qtyOnHand'), memoOut = sum('memoOut'), soCommitted = sum('soCommitted');
  return { ...i, purchasePrice: Number(i.purchasePrice), sellingPrice: Number(i.sellingPrice), mrp: i.mrp == null ? null : Number(i.mrp), weight: i.weight == null ? null : Number(i.weight), rapaportPrice: i.rapaportPrice == null ? null : Number(i.rapaportPrice), rapBack: i.rapBack == null ? null : Number(i.rapBack), pricePerCarat: i.pricePerCarat == null ? null : Number(i.pricePerCarat), discountValue: Number(i.discountValue), stock: { qtyOnHand, totalIn: sum('totalIn'), totalOut: sum('totalOut'), memoOut, memoIn: sum('memoIn'), soCommitted, poCommitted: sum('poCommitted'), value: sum('value'), saleable: qtyOnHand - memoOut - soCommitted } };
}
