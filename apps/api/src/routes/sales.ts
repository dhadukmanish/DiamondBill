import type { FastifyInstance } from 'fastify';
import { and, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { salesOrderSchema, salesOrderReturnSchema, invoiceSchema, creditNoteSchema, customerPaymentSchema } from '@diamondbill/shared';
import { parse } from '../lib/validate';
import { notFound, validation } from '../lib/errors';
import { ok } from '../lib/respond';
import { parseListQuery } from '../lib/list';
import { filterWhere, sortBy, tableColumns } from '../lib/filters';
import { logActivity } from '../services/activity';
import { getSettings } from '../services/settings';
import { stockIn, stockOut, soCommit, soRelease, reverseRef } from '../services/stock';
import { postJournal, reverseJournal, journalForRef } from '../services/journal';
import { docNumber, computeLine, computeDocTotals, contactSnapshot, taxGroupOf, itemNames, sysAccounts } from '../services/documents';

const n = (v: unknown) => Number(v ?? 0);
const s2 = (v: number) => v.toFixed(2);

async function loadContact(tenantId: string, contactId: string) {
  const [c] = await db.select().from(schema.contacts).where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.tenantId, tenantId)));
  if (!c) throw notFound('Contact');
  return c;
}

/** Compute enriched lines + doc totals for a purchase/sales document body. */
async function buildLines(tenantId: string, rawLines: any[], header: { taxType: 'exclusive' | 'inclusive'; discountType: string; discountValue: number; tdsRateId?: string | null; tcsRateId?: string | null; adjustment?: number; shippingCharge?: number }) {
  const names = await itemNames(tenantId, rawLines.map((l) => l.productItemId));
  const [tds, tcs] = await Promise.all([
    header.tdsRateId ? db.select().from(schema.withholdingRates).where(eq(schema.withholdingRates.id, header.tdsRateId)) : Promise.resolve([]),
    header.tcsRateId ? db.select().from(schema.withholdingRates).where(eq(schema.withholdingRates.id, header.tcsRateId)) : Promise.resolve([]),
  ]);
  const lines = [];
  for (const l of rawLines) {
    const tax = await taxGroupOf(tenantId, l.taxGroupId);
    const calc = computeLine(l, tax, header.taxType);
    const nm = names.get(l.productItemId);
    lines.push({ ...l, productName: nm?.productName ?? l.productName ?? '', itemName: nm?.itemName ?? l.itemName ?? '', sku: nm?.sku ?? l.sku ?? '', ...calc });
  }
  const totals = computeDocTotals(lines.map((l) => ({ taxable: l.taxable, taxAmount: l.taxAmount })), { discountType: header.discountType as any, discountValue: header.discountValue, tdsRate: n(tds[0]?.rate), tcsRate: n(tcs[0]?.rate), adjustment: header.adjustment, shippingCharge: header.shippingCharge });
  return { lines, totals };
}

export async function salesRoutes(app: FastifyInstance) {
  /* ================= Sales Memos (Orders) ================= */
  registerList(app, { table: schema.salesOrders, base: '/api/accounting/sales/orders', permission: 'acc_sales_orders', label: 'Sales Memo', dateCol: 'docDate' as any });

  app.post('/api/accounting/sales/orders', { preHandler: app.requirePermission('acc_sales_orders', 'create') }, async (req) => {
    const body = parse(salesOrderSchema, req.body);
    const contact = await loadContact(req.user.tenantId, body.contactId);
    const { lines, totals } = await buildLines(req.user.tenantId, body.lines, body);
    const { number, seriesId } = await docNumber(req.user.tenantId, body.firmId, 'sales_order', body.seriesId, body.number);
    const row = await db.transaction(async (tx) => {
      const [created] = await tx.insert(schema.salesOrders).values({ ...toRow(body), tenantId: req.user.tenantId, seriesId, number, status: body.saveStatus, contactSnapshot: contactSnapshot(contact), lines, ...totalCols(totals), createdBy: req.user.id }).returning();
      if (body.saveStatus === 'open') for (const l of lines) await soCommit({ tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, productItemId: l.productItemId }, { date: body.docDate, qty: n(l.qty), refType: 'sales_order', refId: created.id, refNumber: number, createdBy: req.user.id }, tx as any);
      return created;
    });
    await logActivity(req, 'sales_order', row.id, 'created', `Sales Memo ${row.number} created`);
    return ok(row, 'Sales Memo created successfully');
  });

  app.put('/api/accounting/sales/orders/:id', { preHandler: app.requirePermission('acc_sales_orders', 'update') }, async (req) => {
    const { id } = req.params as { id: string };
    const [existing] = await db.select().from(schema.salesOrders).where(and(eq(schema.salesOrders.id, id), eq(schema.salesOrders.tenantId, req.user.tenantId)));
    if (!existing) throw notFound('Sales Memo');
    if (existing.status === 'converted') throw validation('A converted Sales Memo cannot be edited');
    const body = parse(salesOrderSchema, req.body);
    const contact = await loadContact(req.user.tenantId, body.contactId);
    const { lines, totals } = await buildLines(req.user.tenantId, body.lines, body);
    const row = await db.transaction(async (tx) => {
      await reverseRef(req.user.tenantId, 'sales_order', id, tx as any);
      const [updated] = await tx.update(schema.salesOrders).set({ ...toRow(body), status: body.saveStatus, contactSnapshot: contactSnapshot(contact), lines, ...totalCols(totals), updatedAt: new Date() }).where(eq(schema.salesOrders.id, id)).returning();
      if (body.saveStatus === 'open') for (const l of lines) await soCommit({ tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, productItemId: l.productItemId }, { date: body.docDate, qty: n(l.qty), refType: 'sales_order', refId: id, refNumber: updated.number, createdBy: req.user.id }, tx as any);
      return updated;
    });
    await logActivity(req, 'sales_order', id, 'updated', `Sales Memo ${row.number} updated`);
    return ok(row, 'Sales Memo updated successfully');
  });

  app.delete('/api/accounting/sales/orders/:id', { preHandler: app.requirePermission('acc_sales_orders', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    const [r] = await db.select().from(schema.salesOrders).where(and(eq(schema.salesOrders.id, id), eq(schema.salesOrders.tenantId, req.user.tenantId)));
    if (!r) throw notFound('Sales Memo');
    if (r.status === 'converted') throw validation('A converted Sales Memo cannot be deleted');
    await db.transaction(async (tx) => { await reverseRef(req.user.tenantId, 'sales_order', id, tx as any); await tx.delete(schema.salesOrders).where(eq(schema.salesOrders.id, id)); });
    await logActivity(req, 'sales_order', id, 'deleted', `Sales Memo ${r.number} deleted`);
    return ok(null, 'Sales Memo deleted');
  });

  /* ================= Sales Memo Returns ================= */
  registerList(app, { table: schema.salesOrderReturns, base: '/api/accounting/sales/so-returns', permission: 'acc_so_return', label: 'Sales Memo Return', dateCol: 'docDate' as any });

  app.post('/api/accounting/sales/so-returns', { preHandler: app.requirePermission('acc_so_return', 'create') }, async (req) => {
    const body = parse(salesOrderReturnSchema, req.body);
    const contact = await loadContact(req.user.tenantId, body.contactId);
    const { lines, totals } = await buildLines(req.user.tenantId, body.lines, body);
    const { number, seriesId } = await docNumber(req.user.tenantId, body.firmId, 'sales_order_return', body.seriesId, body.number);
    const row = await db.transaction(async (tx) => {
      const [created] = await tx.insert(schema.salesOrderReturns).values({ ...toRow(body), tenantId: req.user.tenantId, seriesId, number, status: body.saveStatus, contactSnapshot: contactSnapshot(contact), lines, ...totalCols(totals), createdBy: req.user.id }).returning();
      if (body.saveStatus === 'open' && body.salesOrderId) {
        for (const l of lines) await soRelease({ tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, productItemId: l.productItemId }, { date: body.docDate, qty: n(l.qty), refType: 'sales_order_return', refId: created.id, refNumber: number, createdBy: req.user.id }, tx as any);
      }
      return created;
    });
    await logActivity(req, 'sales_order_return', row.id, 'created', `Sales Memo Return ${row.number} created`);
    return ok(row, 'Sales Memo Return created successfully');
  });

  app.delete('/api/accounting/sales/so-returns/:id', { preHandler: app.requirePermission('acc_so_return', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    const [r] = await db.select().from(schema.salesOrderReturns).where(and(eq(schema.salesOrderReturns.id, id), eq(schema.salesOrderReturns.tenantId, req.user.tenantId)));
    if (!r) throw notFound('Sales Memo Return');
    await db.transaction(async (tx) => { await reverseRef(req.user.tenantId, 'sales_order_return', id, tx as any); await tx.delete(schema.salesOrderReturns).where(eq(schema.salesOrderReturns.id, id)); });
    await logActivity(req, 'sales_order_return', id, 'deleted', `Sales Memo Return ${r.number} deleted`);
    return ok(null, 'Sales Memo Return deleted');
  });

  /* ================= Invoices ================= */
  registerList(app, { table: schema.invoices, base: '/api/accounting/sales/invoices', permission: 'acc_invoices', label: 'Invoice', dateCol: 'docDate' as any });

  app.get('/api/accounting/sales/invoices/:id/journal', { preHandler: app.requirePermission('acc_invoices') }, async (req) => ok(await journalForRef(req.user.tenantId, 'invoice', (req.params as any).id)));

  app.post('/api/accounting/sales/invoices', { preHandler: app.requirePermission('acc_invoices', 'create') }, async (req) => {
    const body = parse(invoiceSchema, req.body);
    const contact = await loadContact(req.user.tenantId, body.contactId);
    const { lines, totals } = await buildLines(req.user.tenantId, body.lines, body);
    const { number, seriesId } = await docNumber(req.user.tenantId, body.firmId, 'invoice', body.seriesId, body.number);
    const sys = await sysAccounts(req.user.tenantId, ['inventory_asset', 'accounts_receivable', 'sales', 'cogs', 'output_cgst', 'output_sgst', 'output_igst', 'output_cess', 'tds_receivable', 'tcs_payable', 'adjustment', 'shipping_charge']);
    const row = await db.transaction(async (tx) => {
      const [created] = await tx.insert(schema.invoices).values({ ...toRow(body), tenantId: req.user.tenantId, seriesId, number, status: body.saveStatus, contactSnapshot: contactSnapshot(contact), lines, ...totalCols(totals), balanceDue: s2(body.saveStatus === 'open' ? totals.totalAmount : 0), createdBy: req.user.id }).returning();
      if (body.saveStatus === 'open') {
        let cogs = 0;
        for (const l of lines) { const r = await stockOut({ tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, productItemId: l.productItemId }, { date: body.docDate, qty: n(l.qty), allowNegative: true, refType: 'invoice', refId: created.id, refNumber: number, createdBy: req.user.id }, tx as any); cogs += r.value; }
        if (body.salesOrderId) { await reverseRef(req.user.tenantId, 'sales_order', body.salesOrderId, tx as any); await tx.update(schema.salesOrders).set({ status: 'converted', updatedAt: new Date() }).where(eq(schema.salesOrders.id, body.salesOrderId)); }
        const revenueAmt = totals.subtotal - totals.discountAmount;
        const lineTax = (key: string) => lines.reduce((s, l: any) => s + n(l[key]), 0);
        await postJournal(tx as any, {
          tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, date: body.docDate, refType: 'invoice', refId: created.id, refNumber: number, description: `Invoice ${number}`, createdBy: req.user.id,
          lines: [
            { accountId: sys('accounts_receivable')!, debit: totals.totalAmount, contactId: body.contactId },
            { accountId: sys('tds_receivable')!, debit: totals.tdsAmount },
            { accountId: sys('sales')!, credit: revenueAmt },
            { accountId: sys('output_cgst')!, credit: lineTax('cgstAmount') },
            { accountId: sys('output_sgst')!, credit: lineTax('sgstAmount') },
            { accountId: sys('output_igst')!, credit: lineTax('igstAmount') },
            { accountId: sys('output_cess')!, credit: lineTax('cessAmount') },
            { accountId: sys('shipping_charge')!, credit: n(body.shippingCharge) },
            { accountId: sys('adjustment')!, credit: n(body.adjustment) },
            { accountId: sys('tcs_payable')!, credit: totals.tcsAmount },
            { accountId: sys('cogs')!, debit: cogs },
            { accountId: sys('inventory_asset')!, credit: cogs },
          ].filter((l) => n(l.debit) > 0.004 || n(l.credit) > 0.004),
        });
      }
      return created;
    });
    await logActivity(req, 'invoice', row.id, 'created', `Invoice ${row.number} created`);
    return ok(row, 'Invoice created successfully');
  });

  app.delete('/api/accounting/sales/invoices/:id', { preHandler: app.requirePermission('acc_invoices', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    const [r] = await db.select().from(schema.invoices).where(and(eq(schema.invoices.id, id), eq(schema.invoices.tenantId, req.user.tenantId)));
    if (!r) throw notFound('Invoice');
    if (n(r.amountPaid) > 0) throw validation('Remove payments against this invoice before deleting it');
    await db.transaction(async (tx) => { await reverseRef(req.user.tenantId, 'invoice', id, tx as any); await reverseJournal(tx as any, req.user.tenantId, 'invoice', id); await tx.delete(schema.invoices).where(eq(schema.invoices.id, id)); });
    await logActivity(req, 'invoice', id, 'deleted', `Invoice ${r.number} deleted`);
    return ok(null, 'Invoice deleted');
  });

  /* ================= Credit Notes ================= */
  registerList(app, { table: schema.creditNotes, base: '/api/accounting/sales/credit-notes', permission: 'acc_credit_notes', label: 'Credit Note', dateCol: 'docDate' as any });

  app.get('/api/accounting/sales/credit-notes/:id/journal', { preHandler: app.requirePermission('acc_credit_notes') }, async (req) => ok(await journalForRef(req.user.tenantId, 'credit_note', (req.params as any).id)));

  app.post('/api/accounting/sales/credit-notes', { preHandler: app.requirePermission('acc_credit_notes', 'create') }, async (req) => {
    const body = parse(creditNoteSchema, req.body);
    const contact = await loadContact(req.user.tenantId, body.contactId);
    const { lines, totals } = await buildLines(req.user.tenantId, body.lines, body);
    const { number, seriesId } = await docNumber(req.user.tenantId, body.firmId, 'credit_note', body.seriesId, body.number);
    const sys = await sysAccounts(req.user.tenantId, ['inventory_asset', 'accounts_receivable', 'sales', 'cogs', 'output_cgst', 'output_sgst', 'output_igst', 'output_cess']);
    const row = await db.transaction(async (tx) => {
      const [created] = await tx.insert(schema.creditNotes).values({ ...toRow(body), tenantId: req.user.tenantId, seriesId, number, status: body.saveStatus, contactSnapshot: contactSnapshot(contact), lines, ...totalCols(totals), balanceDue: s2(body.saveStatus === 'open' ? totals.totalAmount : 0), createdBy: req.user.id }).returning();
      if (body.saveStatus === 'open') {
        let reversedCost = 0;
        if (!body.amountCorrectionOnly) for (const l of lines) { const r = await stockIn({ tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, productItemId: l.productItemId }, { date: body.docDate, qty: n(l.qty), rate: n(l.taxable) / n(l.qty), refType: 'credit_note', refId: created.id, refNumber: number, createdBy: req.user.id }, tx as any); reversedCost += r.value; }
        const revenueAmt = totals.subtotal - totals.discountAmount;
        const lineTax = (key: string) => lines.reduce((s, l: any) => s + n(l[key]), 0);
        await postJournal(tx as any, {
          tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, date: body.docDate, refType: 'credit_note', refId: created.id, refNumber: number, description: `Credit Note ${number}`, createdBy: req.user.id,
          lines: [
            { accountId: sys('sales')!, debit: revenueAmt },
            { accountId: sys('output_cgst')!, debit: lineTax('cgstAmount') },
            { accountId: sys('output_sgst')!, debit: lineTax('sgstAmount') },
            { accountId: sys('output_igst')!, debit: lineTax('igstAmount') },
            { accountId: sys('output_cess')!, debit: lineTax('cessAmount') },
            { accountId: sys('accounts_receivable')!, credit: totals.totalAmount, contactId: body.contactId },
            { accountId: sys('inventory_asset')!, debit: reversedCost },
            { accountId: sys('cogs')!, credit: reversedCost },
          ].filter((l) => n(l.debit) > 0.004 || n(l.credit) > 0.004),
        });
      }
      return created;
    });
    await logActivity(req, 'credit_note', row.id, 'created', `Credit Note ${row.number} created`);
    return ok(row, 'Credit Note created successfully');
  });

  app.delete('/api/accounting/sales/credit-notes/:id', { preHandler: app.requirePermission('acc_credit_notes', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    const [r] = await db.select().from(schema.creditNotes).where(and(eq(schema.creditNotes.id, id), eq(schema.creditNotes.tenantId, req.user.tenantId)));
    if (!r) throw notFound('Credit Note');
    if (n(r.amountPaid) > 0) throw validation('Remove payments against this credit note before deleting it');
    await db.transaction(async (tx) => { await reverseRef(req.user.tenantId, 'credit_note', id, tx as any); await reverseJournal(tx as any, req.user.tenantId, 'credit_note', id); await tx.delete(schema.creditNotes).where(eq(schema.creditNotes.id, id)); });
    await logActivity(req, 'credit_note', id, 'deleted', `Credit Note ${r.number} deleted`);
    return ok(null, 'Credit Note deleted');
  });

  /* ================= Customer Payments ================= */
  registerList(app, { table: schema.customerPayments, base: '/api/accounting/sales/customer-payments', permission: 'acc_customer_payments', label: 'Customer Payment', dateCol: 'paymentDate' as any });

  /** Open invoices + credit notes for a customer, for the bill-allocation table. */
  app.get('/api/accounting/sales/customer-payments/pending-invoices', { preHandler: app.authenticate }, async (req) => {
    const { contactId } = req.query as { contactId?: string };
    if (!contactId) return ok([]);
    const invs = await db.select().from(schema.invoices).where(and(eq(schema.invoices.tenantId, req.user.tenantId), eq(schema.invoices.contactId, contactId), inArray(schema.invoices.status, ['open', 'partially_paid'])));
    const notes = await db.select().from(schema.creditNotes).where(and(eq(schema.creditNotes.tenantId, req.user.tenantId), eq(schema.creditNotes.contactId, contactId), inArray(schema.creditNotes.status, ['open', 'partially_paid'])));
    return ok([
      ...invs.map((b) => ({ docType: 'invoice', docId: b.id, docNumber: b.number, docDate: b.docDate, billAmount: n(b.totalAmount), amountDue: n(b.balanceDue) })),
      ...notes.map((b) => ({ docType: 'credit_note', docId: b.id, docNumber: b.number, docDate: b.docDate, billAmount: n(b.totalAmount), amountDue: n(b.balanceDue) })),
    ]);
  });

  app.get('/api/accounting/sales/customer-payments/:id/journal', { preHandler: app.requirePermission('acc_customer_payments') }, async (req) => ok(await journalForRef(req.user.tenantId, 'customer_payment', (req.params as any).id)));

  app.post('/api/accounting/sales/customer-payments', { preHandler: app.requirePermission('acc_customer_payments', 'create') }, async (req) => {
    const body = parse(customerPaymentSchema, req.body);
    const contact = await loadContact(req.user.tenantId, body.contactId);
    const { number, seriesId } = await docNumber(req.user.tenantId, body.firmId, 'customer_payment', body.seriesId, body.number);
    const applied = body.allocations.reduce((s, a) => s + a.amountApplied, 0);
    const writeOff = body.allocations.reduce((s, a) => s + a.writeOffAmount, 0);
    const discount = body.allocations.reduce((s, a) => s + a.discountAmount, 0);
    if (body.paymentType === 'payment' || body.paymentType === 'note_payment') {
      if (Math.abs(applied - writeOff - discount - body.amount) > 0.02) throw validation('Amount received + write-off + discount must equal the total applied to invoices');
    }
    const sys = await sysAccounts(req.user.tenantId, ['accounts_receivable', 'write_off_expense', 'discount_allowed', 'customer_advance']);
    const settings = await getSettings(req.user.tenantId);
    const advanceAccountId = settings.customerAdvanceAccountId ?? sys('customer_advance');
    const row = await db.transaction(async (tx) => {
      const [created] = await tx.insert(schema.customerPayments).values({ ...toRow(body), tenantId: req.user.tenantId, seriesId, number, status: body.saveStatus, contactSnapshot: contactSnapshot(contact), createdBy: req.user.id }).returning();
      if (body.saveStatus === 'paid') {
        for (const a of body.allocations) {
          const T = a.docType === 'credit_note' ? schema.creditNotes : schema.invoices;
          const [doc] = await tx.select().from(T as any).where(eq((T as any).id, a.docId));
          if (doc) {
            const paid = n((doc as any).amountPaid) + a.amountApplied;
            const balance = n((doc as any).totalAmount) - paid;
            await tx.update(T as any).set({ amountPaid: s2(paid), balanceDue: s2(Math.max(0, balance)), status: balance <= 0.02 ? 'paid' : 'partially_paid', updatedAt: new Date() }).where(eq((T as any).id, a.docId));
          }
        }
        const jLines: any[] = [];
        if (body.paymentType === 'advance') { jLines.push({ accountId: body.depositToAccountId, debit: body.amount }, { accountId: advanceAccountId, credit: body.amount, contactId: body.contactId }); }
        else if (body.paymentType === 'refund') { jLines.push({ accountId: sys('accounts_receivable')!, debit: body.amount, contactId: body.contactId }, { accountId: body.depositToAccountId, credit: body.amount }); }
        else { jLines.push({ accountId: body.depositToAccountId, debit: body.amount }, { accountId: sys('accounts_receivable')!, credit: applied, contactId: body.contactId }); if (writeOff > 0.004) jLines.push({ accountId: sys('write_off_expense')!, debit: writeOff }); if (discount > 0.004) jLines.push({ accountId: sys('discount_allowed')!, debit: discount }); }
        await postJournal(tx as any, { tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, date: body.paymentDate, refType: 'customer_payment', refId: created.id, refNumber: number, description: `Customer Payment ${number}`, createdBy: req.user.id, lines: jLines });
      }
      return created;
    });
    await logActivity(req, 'customer_payment', row.id, 'created', `Customer Payment ${row.number} created`);
    return ok(row, 'Customer Payment created successfully');
  });

  app.delete('/api/accounting/sales/customer-payments/:id', { preHandler: app.requirePermission('acc_customer_payments', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    const [r] = await db.select().from(schema.customerPayments).where(and(eq(schema.customerPayments.id, id), eq(schema.customerPayments.tenantId, req.user.tenantId)));
    if (!r) throw notFound('Customer Payment');
    await db.transaction(async (tx) => {
      for (const a of r.allocations as any[]) {
        const T = a.docType === 'credit_note' ? schema.creditNotes : schema.invoices;
        const [doc] = await tx.select().from(T as any).where(eq((T as any).id, a.docId));
        if (doc) { const paid = Math.max(0, n((doc as any).amountPaid) - a.amountApplied); const balance = n((doc as any).totalAmount) - paid; await tx.update(T as any).set({ amountPaid: s2(paid), balanceDue: s2(balance), status: paid <= 0.004 ? 'open' : 'partially_paid', updatedAt: new Date() }).where(eq((T as any).id, a.docId)); }
      }
      await reverseJournal(tx as any, req.user.tenantId, 'customer_payment', id);
      await tx.delete(schema.customerPayments).where(eq(schema.customerPayments.id, id));
    });
    await logActivity(req, 'customer_payment', id, 'deleted', `Customer Payment ${r.number} deleted`);
    return ok(null, 'Customer Payment deleted');
  });
}

/* -------- shared helpers -------- */

function toRow(body: any) {
  const { saveStatus, lines, ...rest } = body;
  return rest;
}
function totalCols(t: { subtotal: number; discountAmount: number; taxAmount: number; tdsAmount: number; tcsAmount: number; totalAmount: number }) {
  return { subtotal: s2(t.subtotal), discountAmount: s2(t.discountAmount), taxAmount: s2(t.taxAmount), tdsAmount: s2(t.tdsAmount), tcsAmount: s2(t.tcsAmount), totalAmount: s2(t.totalAmount) };
}

/** Generic list/get for a trading-document table (create/update/delete stay bespoke per doc type). */
function registerList(app: FastifyInstance, o: { table: any; base: string; permission: string; label: string; dateCol: string; extra?: (row: any) => any }) {
  const t = o.table;
  const cols = tableColumns(t);
  app.get(o.base, { preHandler: app.requirePermission(o.permission) }, async (req) => {
    const q = parseListQuery(req.query as any);
    const { status } = req.query as { status?: string };
    const where = and(
      eq(t.tenantId, req.user.tenantId),
      q.firmId ? eq(t.firmId, q.firmId) : undefined,
      q.branchId ? eq(t.branchId, q.branchId) : undefined,
      status ? inArray(t.status, status.split(',')) : undefined,
      filterWhere((req.query as any).filters, cols),
      q.search ? or(ilike(t.number, `%${q.search}%`), ilike(t.referenceNumber, `%${q.search}%`)) : undefined,
    );
    const [{ total }] = await db.select({ total: count() }).from(t).where(where);
    const rows = await db
      .select({ d: t, firmName: schema.firms.name, branchName: schema.branches.name, contactName: schema.contacts.companyName })
      .from(t)
      .leftJoin(schema.firms, eq(schema.firms.id, t.firmId))
      .leftJoin(schema.branches, eq(schema.branches.id, t.branchId))
      .leftJoin(schema.contacts, eq(schema.contacts.id, t.contactId))
      .where(where)
      .orderBy(sortBy(q.sortBy, q.sortOrder, cols, t[o.dateCol] ?? t.createdAt))
      .limit(q.limit)
      .offset((q.page - 1) * q.limit);
    const shape = (r: any) => { const row = { ...r.d, firmName: r.firmName, branchName: r.branchName, contactName: r.contactName, totalAmount: n(r.d.totalAmount), amountPaid: n(r.d.amountPaid ?? r.d.amount), balanceDue: n(r.d.balanceDue), subtotal: n(r.d.subtotal), taxAmount: n(r.d.taxAmount) }; return o.extra ? o.extra(row) : row; };
    return ok({ rows: rows.map(shape), total: Number(total), page: q.page, pageSize: q.limit }, `${o.label}s retrieved successfully`);
  });

  app.get(`${o.base}/:id`, { preHandler: app.requirePermission(o.permission) }, async (req) => {
    const { id } = req.params as { id: string };
    const [row] = await db.select().from(t).where(and(eq(t.id, id), eq(t.tenantId, req.user.tenantId)));
    if (!row) throw notFound(o.label);
    return ok({ ...row, totalAmount: n((row as any).totalAmount), amountPaid: n((row as any).amountPaid ?? (row as any).amount), balanceDue: n((row as any).balanceDue), subtotal: n((row as any).subtotal) });
  });
}
