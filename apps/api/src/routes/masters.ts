import type { FastifyInstance } from 'fastify';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/client';
import {
  taxGroupSchema, withholdingRateSchema, unitSchema, productCategorySchema, productCategoryBulkSchema, labSchema, salesPersonSchema, salesPersonBulkSchema, termsSchema, chequeBookSchema, carrierSchema, shipmentStatusSchema, paymentModeSchema, paymentTermSchema, processSchema, priceListSchema, productNameTemplateSchema,
  UQC_CODES, PRODUCT_STOCK_TYPES,
} from '@diamondbill/shared';
import { crudRoutes } from '../lib/crud';
import { parse } from '../lib/validate';
import { notFound, validation } from '../lib/errors';
import { ok } from '../lib/respond';

const M = '/api/accounting/masters';
const numStr = (v: unknown) => (v == null ? undefined : String(v));

export async function masterRoutes(app: FastifyInstance) {
  /* ---------------- Taxes ---------------- */
  crudRoutes(app, {
    table: schema.taxGroups, base: `${M}/tax-groups`, permission: 'acc_taxes', schema: taxGroupSchema, label: 'Tax group', listAll: true,
    searchColumns: [schema.taxGroups.name], defaultSort: schema.taxGroups.name, protectSystem: true,
    filter: (_r, q) => [q.taxType ? eq(schema.taxGroups.taxType, q.taxType) : undefined, q.isComposite ? eq(schema.taxGroups.isComposite, q.isComposite === 'true') : undefined],
    toRow: (b, _r, existing) => {
      const out: any = { ...b };
      const type = b.taxType ?? existing?.taxType;
      if (type === 'gst') {
        const cat = b.gstCategory ?? existing?.gstCategory;
        const cgst = Number(b.cgstRate ?? existing?.cgstRate ?? 0), sgst = Number(b.sgstRate ?? existing?.sgstRate ?? 0), igst = Number(b.igstRate ?? existing?.igstRate ?? 0), cess = Number(b.cessRate ?? existing?.cessRate ?? 0);
        if (cat === 'intra_state') { out.igstRate = '0'; out.rate = String(cgst + sgst + cess); } else { out.cgstRate = '0'; out.sgstRate = '0'; out.rate = String(igst + cess); }
      } else if (type === 'out_of_scope') { out.rate = '0'; out.cgstRate = '0'; out.sgstRate = '0'; out.igstRate = '0'; out.cessRate = '0'; }
      for (const k of ['rate', 'cgstRate', 'sgstRate', 'igstRate', 'cessRate']) if (out[k] !== undefined) out[k] = numStr(out[k]);
      return out;
    },
    shape: (r) => ({ ...r, rate: Number(r.rate), cgstRate: Number(r.cgstRate), sgstRate: Number(r.sgstRate), igstRate: Number(r.igstRate), cessRate: Number(r.cessRate) }),
  });

  /* ---------------- TDS / TCS ---------------- */
  for (const kind of ['tds', 'tcs'] as const) {
    crudRoutes(app, {
      table: schema.withholdingRates, base: `${M}/${kind}-rates`, permission: kind === 'tds' ? 'acc_tds_settings' : 'acc_tcs_rates', schema: withholdingRateSchema, label: kind.toUpperCase() + ' rate', listAll: true,
      searchColumns: [schema.withholdingRates.name, schema.withholdingRates.section], defaultSort: schema.withholdingRates.name,
      filter: () => [eq(schema.withholdingRates.kind, kind)],
      toRow: (b) => ({ ...b, kind, rate: numStr(b.rate), effectiveFrom: b.effectiveFrom || null, effectiveTo: b.effectiveTo || null }),
      shape: (r) => ({ ...r, rate: Number(r.rate) }),
    });
  }

  /* ---------------- Units ---------------- */
  app.get(`${M}/uqc-codes`, { preHandler: app.authenticate }, async () => ok(UQC_CODES));
  crudRoutes(app, {
    table: schema.units, base: `${M}/units`, permission: 'acc_units', schema: unitSchema, label: 'Unit', listAll: true, searchColumns: [schema.units.name, schema.units.uqcCode], defaultSort: schema.units.name, protectSystem: true,
    beforeSave: async (b) => { if (b.uqcCode && !UQC_CODES.some((u) => u.code === b.uqcCode)) throw validation('Invalid UQC code'); },
  });

  /* ---------------- Product categories ---------------- */
  crudRoutes(app, {
    table: schema.productCategories, base: `${M}/product-categories`, permission: 'acc_categories', schema: productCategorySchema, label: 'Category', listAll: true, searchColumns: [schema.productCategories.name], defaultSort: schema.productCategories.serialNo,
    toRow: (b) => ({ ...b, parentId: b.parentId || null }),
  });
  app.post(`${M}/product-categories/bulk`, { preHandler: app.requirePermission('acc_categories', 'create') }, async (req) => {
    const body = parse(productCategoryBulkSchema, req.body);
    const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${schema.productCategories.serialNo}),0)` }).from(schema.productCategories).where(eq(schema.productCategories.tenantId, req.user.tenantId));
    let n = Number(max);
    const rows = await db.insert(schema.productCategories).values(body.names.map((name) => ({ tenantId: req.user.tenantId, name: name.trim(), serialNo: ++n, parentId: body.parentId || null }))).returning();
    return ok(rows, `${rows.length} categories created successfully`);
  });

  /* ---------------- Labs ---------------- */
  crudRoutes(app, {
    table: schema.labs, base: `${M}/labs`, permission: 'acc_labs', schema: labSchema, label: 'Lab', listAll: true, searchColumns: [schema.labs.labName], defaultSort: schema.labs.labName,
    toRow: (b) => ({ ...b, defaultVendorId: b.defaultVendorId || null }),
  });

  /* ---------------- Sales persons ---------------- */
  crudRoutes(app, {
    table: schema.salesPersons, base: '/api/crm/master/sales-persons', permission: 'acc_sales_persons', schema: salesPersonSchema, label: 'Sales person', listAll: true, searchColumns: [schema.salesPersons.name], defaultSort: schema.salesPersons.name,
    filter: (_r, q) => [q.firmId ? eq(schema.salesPersons.firmId, q.firmId) : undefined],
    toRow: (b) => ({ ...b, firmId: b.firmId || null, userId: b.userId || null }),
  });
  app.post('/api/crm/master/sales-persons/bulk', { preHandler: app.requirePermission('acc_sales_persons', 'create') }, async (req) => {
    const body = parse(salesPersonBulkSchema, req.body);
    const rows = await db.insert(schema.salesPersons).values(body.names.map((name) => ({ tenantId: req.user.tenantId, name: name.trim(), firmId: body.firmId || null, userId: body.userId || null, remark: body.remark ?? null }))).returning();
    return ok(rows, `${rows.length} sales persons created successfully`);
  });

  /* ---------------- Terms & conditions ---------------- */
  crudRoutes(app, {
    table: schema.termsConditions, base: `${M}/terms-conditions`, permission: 'acc_terms', schema: termsSchema, label: 'Terms & conditions', listAll: true, searchColumns: [schema.termsConditions.name], defaultSort: schema.termsConditions.name,
    filter: (_r, q) => [q.firmId ? eq(schema.termsConditions.firmId, q.firmId) : undefined, q.documentType ? eq(schema.termsConditions.documentType, q.documentType) : undefined],
    toRow: (b) => ({ ...b, firmId: b.firmId || null }),
    beforeSave: async (b, req, existing) => {
      if (b.isDefault) {
        const firmId = b.firmId ?? existing?.firmId ?? null, docType = b.documentType ?? existing?.documentType, taxType = b.taxType ?? existing?.taxType;
        await db.update(schema.termsConditions).set({ isDefault: false }).where(and(eq(schema.termsConditions.tenantId, req.user.tenantId), firmId ? eq(schema.termsConditions.firmId, firmId) : sql`${schema.termsConditions.firmId} is null`, eq(schema.termsConditions.documentType, docType), eq(schema.termsConditions.taxType, taxType)));
      }
    },
  });

  /* ---------------- Cheque books ---------------- */
  crudRoutes(app, {
    table: schema.chequeBooks, base: `${M}/cheque-books`, permission: 'acc_cheque_books', schema: chequeBookSchema, label: 'Cheque book', listAll: true, searchColumns: [schema.chequeBooks.name], defaultSort: schema.chequeBooks.name,
    filter: (_r, q) => [q.bankAccountId ? eq(schema.chequeBooks.bankAccountId, q.bankAccountId) : undefined],
    toRow: (b, _r, existing) => ({ ...b, ...(b.fromNo !== undefined && !existing ? { nextNo: b.fromNo } : {}) }),
    beforeSave: async (b, req, existing) => {
      if (b.isDefault) {
        const bank = b.bankAccountId ?? existing?.bankAccountId;
        await db.update(schema.chequeBooks).set({ isDefault: false }).where(and(eq(schema.chequeBooks.tenantId, req.user.tenantId), eq(schema.chequeBooks.bankAccountId, bank)));
      }
    },
    shape: (r) => ({ ...r, total: r.toNo - r.fromNo + 1, used: r.usedNos?.length ?? 0, remaining: r.toNo - r.fromNo + 1 - (r.usedNos?.length ?? 0) }),
  });
  /** Cheque leaves of a book */
  app.get(`${M}/cheque-books/:id/leaves`, { preHandler: app.requirePermission('acc_cheque_books') }, async (req) => {
    const { id } = req.params as { id: string };
    const [b] = await db.select().from(schema.chequeBooks).where(and(eq(schema.chequeBooks.id, id), eq(schema.chequeBooks.tenantId, req.user.tenantId)));
    if (!b) throw notFound('Cheque book');
    const used = new Set(b.usedNos ?? []);
    const leaves = Array.from({ length: b.toNo - b.fromNo + 1 }, (_, i) => ({ no: b.fromNo + i, status: used.has(b.fromNo + i) ? 'used' : 'available' }));
    return ok(leaves);
  });

  /* ---------------- Carriers / shipment statuses / payment modes / terms ---------------- */
  crudRoutes(app, { table: schema.carriers, base: `${M}/carriers`, permission: 'acc_carriers', schema: carrierSchema, label: 'Carrier', listAll: true, searchColumns: [schema.carriers.name], defaultSort: schema.carriers.name });
  crudRoutes(app, { table: schema.shipmentStatuses, base: `${M}/shipment-statuses`, permission: 'acc_shipment_statuses', schema: shipmentStatusSchema, label: 'Shipment status', listAll: true, searchColumns: [schema.shipmentStatuses.name], defaultSort: schema.shipmentStatuses.name, protectSystem: true });
  crudRoutes(app, { table: schema.paymentModes, base: `${M}/payment-modes`, permission: 'acc_banking', schema: paymentModeSchema, label: 'Payment mode', listAll: true, searchColumns: [schema.paymentModes.name], defaultSort: schema.paymentModes.name, protectSystem: true });
  crudRoutes(app, { table: schema.paymentTerms, base: `${M}/payment-terms`, permission: 'admin_general_settings', schema: paymentTermSchema, label: 'Payment term', listAll: true, searchColumns: [schema.paymentTerms.name], defaultSort: schema.paymentTerms.days, protectSystem: true });

  /* ---------------- Processes ---------------- */
  crudRoutes(app, { table: schema.processes, base: '/api/accounting/product-process/processes', permission: 'acc_product_process', schema: processSchema, label: 'Process', listAll: true, searchColumns: [schema.processes.name], defaultSort: schema.processes.sequence, filter: (_r, q) => [q.behavior ? eq(schema.processes.behavior, q.behavior) : undefined] });

  /* ---------------- Price lists ---------------- */
  crudRoutes(app, { table: schema.priceLists, base: `${M}/price-lists`, permission: 'acc_price_lists', schema: priceListSchema, label: 'Price list', listAll: true, searchColumns: [schema.priceLists.name], defaultSort: schema.priceLists.name });

  /* ---------------- Product name templates (one row per stock type) ---------------- */
  app.get(`${M}/product-name-templates`, { preHandler: app.authenticate }, async (req) => {
    const rows = await db.select().from(schema.productNameTemplates).where(eq(schema.productNameTemplates.tenantId, req.user.tenantId));
    const byType = new Map(rows.map((r) => [r.stockType, r]));
    return ok(PRODUCT_STOCK_TYPES.map((st) => byType.get(st) ?? { id: null, stockType: st, productTemplate: '##Product Name##', subProductTemplate: '##Product Name## - ##Serial##' }));
  });
  app.put(`${M}/product-name-templates`, { preHandler: app.requirePermission('admin_general_settings', 'update') }, async (req) => {
    const body = parse(productNameTemplateSchema.array(), req.body);
    for (const t of body) {
      const [existing] = await db.select().from(schema.productNameTemplates).where(and(eq(schema.productNameTemplates.tenantId, req.user.tenantId), eq(schema.productNameTemplates.stockType, t.stockType)));
      if (existing) await db.update(schema.productNameTemplates).set({ productTemplate: t.productTemplate, subProductTemplate: t.subProductTemplate, updatedAt: new Date() }).where(eq(schema.productNameTemplates.id, existing.id));
      else await db.insert(schema.productNameTemplates).values({ ...t, tenantId: req.user.tenantId });
    }
    return ok(null, 'Templates saved successfully');
  });

  /* ---------------- Lookups (light payloads for pickers) ---------------- */
  app.get('/api/common/lookups/masters', { preHandler: app.authenticate }, async (req) => {
    const tid = req.user.tenantId;
    const [taxes, units, categories, labsRows, sales, modes, terms, carriersRows, statuses] = await Promise.all([
      db.select({ id: schema.taxGroups.id, name: schema.taxGroups.name, rate: schema.taxGroups.rate, taxType: schema.taxGroups.taxType, gstCategory: schema.taxGroups.gstCategory }).from(schema.taxGroups).where(and(eq(schema.taxGroups.tenantId, tid), eq(schema.taxGroups.isActive, true))).orderBy(asc(schema.taxGroups.name)),
      db.select({ id: schema.units.id, name: schema.units.name, uqcCode: schema.units.uqcCode, decimalPlaces: schema.units.decimalPlaces }).from(schema.units).where(and(eq(schema.units.tenantId, tid), eq(schema.units.isActive, true))).orderBy(asc(schema.units.name)),
      db.select({ id: schema.productCategories.id, name: schema.productCategories.name, parentId: schema.productCategories.parentId }).from(schema.productCategories).where(and(eq(schema.productCategories.tenantId, tid), eq(schema.productCategories.isActive, true))).orderBy(asc(schema.productCategories.serialNo)),
      db.select({ id: schema.labs.id, name: schema.labs.labName, labType: schema.labs.labType, defaultVendorId: schema.labs.defaultVendorId }).from(schema.labs).where(and(eq(schema.labs.tenantId, tid), eq(schema.labs.isActive, true))).orderBy(asc(schema.labs.labName)),
      db.select({ id: schema.salesPersons.id, name: schema.salesPersons.name, firmId: schema.salesPersons.firmId }).from(schema.salesPersons).where(and(eq(schema.salesPersons.tenantId, tid), eq(schema.salesPersons.isActive, true))).orderBy(asc(schema.salesPersons.name)),
      db.select({ id: schema.paymentModes.id, name: schema.paymentModes.name }).from(schema.paymentModes).where(and(eq(schema.paymentModes.tenantId, tid), eq(schema.paymentModes.isActive, true))).orderBy(asc(schema.paymentModes.name)),
      db.select({ id: schema.paymentTerms.id, name: schema.paymentTerms.name, days: schema.paymentTerms.days }).from(schema.paymentTerms).where(eq(schema.paymentTerms.tenantId, tid)).orderBy(asc(schema.paymentTerms.days)),
      db.select({ id: schema.carriers.id, name: schema.carriers.name, trackingUrl: schema.carriers.trackingUrl }).from(schema.carriers).where(and(eq(schema.carriers.tenantId, tid), eq(schema.carriers.isActive, true))).orderBy(asc(schema.carriers.name)),
      db.select({ id: schema.shipmentStatuses.id, name: schema.shipmentStatuses.name, statusType: schema.shipmentStatuses.statusType }).from(schema.shipmentStatuses).where(eq(schema.shipmentStatuses.tenantId, tid)).orderBy(asc(schema.shipmentStatuses.name)),
    ]);
    return ok({ taxGroups: taxes.map((t) => ({ ...t, rate: Number(t.rate) })), units, categories, labs: labsRows, salesPersons: sales, paymentModes: modes, paymentTerms: terms, carriers: carriersRows, shipmentStatuses: statuses });
  });
}
