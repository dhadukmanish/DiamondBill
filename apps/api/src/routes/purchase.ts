import type { FastifyInstance } from 'fastify';
import { and, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { purchaseOrderSchema, purchaseOrderReturnSchema, purchaseBillSchema, debitNoteSchema, vendorPaymentSchema } from '@diamondbill/shared';
import { parse } from '../lib/validate';
import { notFound, validation } from '../lib/errors';
import { ok } from '../lib/respond';
import { parseListQuery } from '../lib/list';
import { filterWhere, sortBy, tableColumns } from '../lib/filters';
import { logActivity } from '../services/activity';
import { getSettings } from '../services/settings';
import { stockIn, stockOut, poCommit, poRelease, reverseRef } from '../services/stock';
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

export async function purchaseRoutes(app: FastifyInstance) {
  /* ================= Purchase Memos (Orders) ================= */
  registerList(app, { table: schema.purchaseOrders, base: '/api/accounting/purchase/orders', permission: 'acc_purchase_orders', label: 'Purchase Memo', dateCol: 'docDate' as any });

  app.post('/api/accounting/purchase/orders', { preHandler: app.requirePermission('acc_purchase_orders', 'create') }, async (req) => {
    const body = parse(purchaseOrderSchema, req.body);
    const contact = await loadContact(req.user.tenantId, body.contactId);
    const { lines, totals } = await buildLines(req.user.tenantId, body.lines, body);
    const { number, seriesId } = await docNumber(req.user.tenantId, body.firmId, 'purchase_order', body.seriesId, body.number);
    const row = await db.transaction(async (tx) => {
      const [created] = await tx.insert(schema.purchaseOrders).values({ ...toRow(body), tenantId: req.user.tenantId, seriesId, number, status: body.saveStatus, contactSnapshot: contactSnapshot(contact), lines, ...totalCols(totals), createdBy: req.user.id }).returning();
      if (body.saveStatus === 'open') for (const l of lines) await poCommit({ tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, productItemId: l.productItemId }, { date: body.docDate, qty: n(l.qty), refType: 'purchase_order', refId: created.id, refNumber: number, createdBy: req.user.id }, tx as any);
      return created;
    });
    await logActivity(req, 'purchase_order', row.id, 'created', `Purchase Memo ${row.number} created`);
    return ok(row, 'Purchase Memo created successfully');
  });

  app.put('/api/accounting/purchase/orders/:id', { preHandler: app.requirePermission('acc_purchase_orders', 'update') }, async (req) => {
    const { id } = req.params as { id: string };
    const [existing] = await db.select().from(schema.purchaseOrders).where(and(eq(schema.purchaseOrders.id, id), eq(schema.purchaseOrders.tenantId, req.user.tenantId)));
    if (!existing) throw notFound('Purchase Memo');
    if (existing.status === 'converted') throw validation('A converted Purchase Memo cannot be edited');
    const body = parse(purchaseOrderSchema, req.body);
    const contact = await loadContact(req.user.tenantId, body.contactId);
    const { lines, totals } = await buildLines(req.user.tenantId, body.lines, body);
    const row = await db.transaction(async (tx) => {
      await reverseRef(req.user.tenantId, 'purchase_order', id, tx as any);
      const [updated] = await tx.update(schema.purchaseOrders).set({ ...toRow(body), status: body.saveStatus, contactSnapshot: contactSnapshot(contact), lines, ...totalCols(totals), updatedAt: new Date() }).where(eq(schema.purchaseOrders.id, id)).returning();
      if (body.saveStatus === 'open') for (const l of lines) await poCommit({ tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, productItemId: l.productItemId }, { date: body.docDate, qty: n(l.qty), refType: 'purchase_order', refId: id, refNumber: updated.number, createdBy: req.user.id }, tx as any);
      return updated;
    });
    await logActivity(req, 'purchase_order', id, 'updated', `Purchase Memo ${row.number} updated`);
    return ok(row, 'Purchase Memo updated successfully');
  });

  app.delete('/api/accounting/purchase/orders/:id', { preHandler: app.requirePermission('acc_purchase_orders', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    const [r] = await db.select().from(schema.purchaseOrders).where(and(eq(schema.purchaseOrders.id, id), eq(schema.purchaseOrders.tenantId, req.user.tenantId)));
    if (!r) throw notFound('Purchase Memo');
    if (r.status === 'converted') throw validation('A converted Purchase Memo cannot be deleted');
    await db.transaction(async (tx) => { await reverseRef(req.user.tenantId, 'purchase_order', id, tx as any); await tx.delete(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, id)); });
    await logActivity(req, 'purchase_order', id, 'deleted', `Purchase Memo ${r.number} deleted`);
    return ok(null, 'Purchase Memo deleted');
  });

  /* ================= Purchase Memo Returns ================= */
  registerList(app, { table: schema.purchaseOrderReturns, base: '/api/accounting/purchase/po-returns', permission: 'acc_po_return', label: 'Purchase Memo Return', dateCol: 'docDate' as any });

  app.post('/api/accounting/purchase/po-returns', { preHandler: app.requirePermission('acc_po_return', 'create') }, async (req) => {
    const body = parse(purchaseOrderReturnSchema, req.body);
    const contact = await loadContact(req.user.tenantId, body.contactId);
    const { lines, totals } = await buildLines(req.user.tenantId, body.lines, body);
    const { number, seriesId } = await docNumber(req.user.tenantId, body.firmId, 'purchase_order_return', body.seriesId, body.number);
    const row = await db.transaction(async (tx) => {
      const [created] = await tx.insert(schema.purchaseOrderReturns).values({ ...toRow(body), tenantId: req.user.tenantId, seriesId, number, status: body.saveStatus, contactSnapshot: contactSnapshot(contact), lines, ...totalCols(totals), createdBy: req.user.id }).returning();
      if (body.saveStatus === 'open' && body.purchaseOrderId) {
        for (const l of lines) await poRelease({ tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, productItemId: l.productItemId }, { date: body.docDate, qty: n(l.qty), refType: 'purchase_order_return', refId: created.id, refNumber: number, createdBy: req.user.id }, tx as any);
      }
      return created;
    });
    await logActivity(req, 'purchase_order_return', row.id, 'created', `Purchase Memo Return ${row.number} created`);
    return ok(row, 'Purchase Memo Return created successfully');
  });

  app.delete('/api/accounting/purchase/po-returns/:id', { preHandler: app.requirePermission('acc_po_return', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    const [r] = await db.select().from(schema.purchaseOrderReturns).where(and(eq(schema.purchaseOrderReturns.id, id), eq(schema.purchaseOrderReturns.tenantId, req.user.tenantId)));
    if (!r) throw notFound('Purchase Memo Return');
    await db.transaction(async (tx) => { await reverseRef(req.user.tenantId, 'purchase_order_return', id, tx as any); await tx.delete(schema.purchaseOrderReturns).where(eq(schema.purchaseOrderReturns.id, id)); });
    await logActivity(req, 'purchase_order_return', id, 'deleted', `Purchase Memo Return ${r.number} deleted`);
    return ok(null, 'Purchase Memo Return deleted');
  });

  /* ================= Purchase Bills ================= */
  registerList(app, { table: schema.purchaseBills, base: '/api/accounting/purchase/bills', permission: 'acc_purchases', label: 'Purchase Bill', dateCol: 'docDate' as any, extra: (row: any) => ({ ...row, expense: n(row.taxAmount) }) });

  app.get('/api/accounting/purchase/bills/:id/journal', { preHandler: app.requirePermission('acc_purchases') }, async (req) => {
    const { id } = req.params as { id: string };
    return ok(await journalForRef(req.user.tenantId, 'purchase_bill', id));
  });

  app.post('/api/accounting/purchase/bills', { preHandler: app.requirePermission('acc_purchases', 'create') }, async (req) => {
    const body = parse(purchaseBillSchema, req.body);
    const contact = await loadContact(req.user.tenantId, body.contactId);
    const { lines, totals } = await buildLines(req.user.tenantId, body.lines, body);
    const { number, seriesId } = await docNumber(req.user.tenantId, body.firmId, 'purchase_bill', body.seriesId, body.number);
    const settings = await getSettings(req.user.tenantId);
    const sys = await sysAccounts(req.user.tenantId, ['inventory_asset', 'accounts_payable', 'input_cgst', 'input_sgst', 'input_igst', 'input_cess', 'tcs_receivable', 'tds_payable', 'adjustment']);
    const row = await db.transaction(async (tx) => {
      const [created] = await tx.insert(schema.purchaseBills).values({ ...toRow(body), tenantId: req.user.tenantId, seriesId, number, status: body.saveStatus, contactSnapshot: contactSnapshot(contact), lines, ...totalCols(totals), balanceDue: s2(body.saveStatus === 'open' ? totals.totalAmount : 0), createdBy: req.user.id }).returning();
      if (body.saveStatus === 'open') {
        for (const l of lines) await stockIn({ tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, productItemId: l.productItemId }, { date: body.docDate, qty: n(l.qty), rate: n(l.taxable) / n(l.qty), refType: 'purchase_bill', refId: created.id, refNumber: number, createdBy: req.user.id }, tx as any);
        if (body.purchaseOrderId) { await reverseRef(req.user.tenantId, 'purchase_order', body.purchaseOrderId, tx as any); await tx.update(schema.purchaseOrders).set({ status: 'converted', updatedAt: new Date() }).where(eq(schema.purchaseOrders.id, body.purchaseOrderId)); }
        const inventoryAmt = totals.subtotal - totals.discountAmount + n(body.shippingCharge);
        const lineTax = (key: string) => lines.reduce((s, l: any) => s + n(l[key]), 0);
        await postJournal(tx as any, {
          tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, date: body.docDate, refType: 'purchase_bill', refId: created.id, refNumber: number, description: `Purchase Bill ${number}`, createdBy: req.user.id,
          lines: [
            { accountId: sys('inventory_asset')!, debit: inventoryAmt },
            { accountId: sys('input_cgst')!, debit: lineTax('cgstAmount') },
            { accountId: sys('input_sgst')!, debit: lineTax('sgstAmount') },
            { accountId: sys('input_igst')!, debit: lineTax('igstAmount') },
            { accountId: sys('input_cess')!, debit: lineTax('cessAmount') },
            { accountId: sys('tcs_receivable')!, debit: totals.tcsAmount },
            { accountId: sys('adjustment')!, debit: n(body.adjustment) },
            { accountId: sys('accounts_payable')!, credit: totals.totalAmount, contactId: body.contactId },
            { accountId: sys('tds_payable')!, credit: totals.tdsAmount },
          ].filter((l) => n(l.debit) > 0.004 || n(l.credit) > 0.004),
        });
      }
      return created;
    });
    await logActivity(req, 'purchase_bill', row.id, 'created', `Purchase Bill ${row.number} created`);
    return ok(row, 'Purchase Bill created successfully');
  });

  app.delete('/api/accounting/purchase/bills/:id', { preHandler: app.requirePermission('acc_purchases', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    const [r] = await db.select().from(schema.purchaseBills).where(and(eq(schema.purchaseBills.id, id), eq(schema.purchaseBills.tenantId, req.user.tenantId)));
    if (!r) throw notFound('Purchase Bill');
    if (n(r.amountPaid) > 0) throw validation('Remove payments against this bill before deleting it');
    await db.transaction(async (tx) => { await reverseRef(req.user.tenantId, 'purchase_bill', id, tx as any); await reverseJournal(tx as any, req.user.tenantId, 'purchase_bill', id); await tx.delete(schema.purchaseBills).where(eq(schema.purchaseBills.id, id)); });
    await logActivity(req, 'purchase_bill', id, 'deleted', `Purchase Bill ${r.number} deleted`);
    return ok(null, 'Purchase Bill deleted');
  });

  /* ================= Debit Notes ================= */
  registerList(app, { table: schema.debitNotes, base: '/api/accounting/purchase/debit-notes', permission: 'acc_debit_notes', label: 'Debit Note', dateCol: 'docDate' as any });

  app.get('/api/accounting/purchase/debit-notes/:id/journal', { preHandler: app.requirePermission('acc_debit_notes') }, async (req) => ok(await journalForRef(req.user.tenantId, 'debit_note', (req.params as any).id)));

  app.post('/api/accounting/purchase/debit-notes', { preHandler: app.requirePermission('acc_debit_notes', 'create') }, async (req) => {
    const body = parse(debitNoteSchema, req.body);
    const contact = await loadContact(req.user.tenantId, body.contactId);
    const { lines, totals } = await buildLines(req.user.tenantId, body.lines, body);
    const { number, seriesId } = await docNumber(req.user.tenantId, body.firmId, 'debit_note', body.seriesId, body.number);
    const sys = await sysAccounts(req.user.tenantId, ['inventory_asset', 'accounts_payable', 'input_cgst', 'input_sgst', 'input_igst', 'input_cess']);
    const row = await db.transaction(async (tx) => {
      const [created] = await tx.insert(schema.debitNotes).values({ ...toRow(body), tenantId: req.user.tenantId, seriesId, number, status: body.saveStatus, contactSnapshot: contactSnapshot(contact), lines, ...totalCols(totals), balanceDue: s2(body.saveStatus === 'open' ? totals.totalAmount : 0), createdBy: req.user.id }).returning();
      if (body.saveStatus === 'open') {
        if (!body.amountCorrectionOnly) for (const l of lines) await stockOut({ tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, productItemId: l.productItemId }, { date: body.docDate, qty: n(l.qty), allowNegative: true, refType: 'debit_note', refId: created.id, refNumber: number, createdBy: req.user.id }, tx as any);
        const inventoryAmt = totals.subtotal - totals.discountAmount + n(body.shippingCharge);
        const lineTax = (key: string) => lines.reduce((s, l: any) => s + n(l[key]), 0);
        await postJournal(tx as any, {
          tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, date: body.docDate, refType: 'debit_note', refId: created.id, refNumber: number, description: `Debit Note ${number}`, createdBy: req.user.id,
          lines: [
            { accountId: sys('accounts_payable')!, debit: totals.totalAmount, contactId: body.contactId },
            { accountId: sys('inventory_asset')!, credit: inventoryAmt },
            { accountId: sys('input_cgst')!, credit: lineTax('cgstAmount') },
            { accountId: sys('input_sgst')!, credit: lineTax('sgstAmount') },
            { accountId: sys('input_igst')!, credit: lineTax('igstAmount') },
            { accountId: sys('input_cess')!, credit: lineTax('cessAmount') },
          ].filter((l) => n(l.debit) > 0.004 || n(l.credit) > 0.004),
        });
      }
      return created;
    });
    await logActivity(req, 'debit_note', row.id, 'created', `Debit Note ${row.number} created`);
    return ok(row, 'Debit Note created successfully');
  });

  app.delete('/api/accounting/purchase/debit-notes/:id', { preHandler: app.requirePermission('acc_debit_notes', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    const [r] = await db.select().from(schema.debitNotes).where(and(eq(schema.debitNotes.id, id), eq(schema.debitNotes.tenantId, req.user.tenantId)));
    if (!r) throw notFound('Debit Note');
    if (n(r.amountPaid) > 0) throw validation('Remove payments against this debit note before deleting it');
    await db.transaction(async (tx) => { await reverseRef(req.user.tenantId, 'debit_note', id, tx as any); await reverseJournal(tx as any, req.user.tenantId, 'debit_note', id); await tx.delete(schema.debitNotes).where(eq(schema.debitNotes.id, id)); });
    await logActivity(req, 'debit_note', id, 'deleted', `Debit Note ${r.number} deleted`);
    return ok(null, 'Debit Note deleted');
  });

  /* ================= Vendor Payments ================= */
  registerList(app, { table: schema.vendorPayments, base: '/api/accounting/purchase/vendor-payments', permission: 'acc_vendor_payments', label: 'Vendor Payment', dateCol: 'paymentDate' as any });

  /** Open bills + debit notes for a vendor, for the bill-allocation table. */
  app.get('/api/accounting/purchase/vendor-payments/pending-bills', { preHandler: app.authenticate }, async (req) => {
    const { contactId } = req.query as { contactId?: string };
    if (!contactId) return ok([]);
    const bills = await db.select().from(schema.purchaseBills).where(and(eq(schema.purchaseBills.tenantId, req.user.tenantId), eq(schema.purchaseBills.contactId, contactId), inArray(schema.purchaseBills.status, ['open', 'partially_paid'])));
    const notes = await db.select().from(schema.debitNotes).where(and(eq(schema.debitNotes.tenantId, req.user.tenantId), eq(schema.debitNotes.contactId, contactId), inArray(schema.debitNotes.status, ['open', 'partially_paid'])));
    return ok([
      ...bills.map((b) => ({ docType: 'purchase_bill', docId: b.id, docNumber: b.number, docDate: b.docDate, billAmount: n(b.totalAmount), amountDue: n(b.balanceDue) })),
      ...notes.map((b) => ({ docType: 'debit_note', docId: b.id, docNumber: b.number, docDate: b.docDate, billAmount: n(b.totalAmount), amountDue: n(b.balanceDue) })),
    ]);
  });

  app.get('/api/accounting/purchase/vendor-payments/:id/journal', { preHandler: app.requirePermission('acc_vendor_payments') }, async (req) => ok(await journalForRef(req.user.tenantId, 'vendor_payment', (req.params as any).id)));

  app.post('/api/accounting/purchase/vendor-payments', { preHandler: app.requirePermission('acc_vendor_payments', 'create') }, async (req) => {
    const body = parse(vendorPaymentSchema, req.body);
    const contact = await loadContact(req.user.tenantId, body.contactId);
    const { number, seriesId } = await docNumber(req.user.tenantId, body.firmId, 'vendor_payment', body.seriesId, body.number);
    const applied = body.allocations.reduce((s, a) => s + a.amountApplied, 0);
    const writeOff = body.allocations.reduce((s, a) => s + a.writeOffAmount, 0);
    const discount = body.allocations.reduce((s, a) => s + a.discountAmount, 0);
    if (body.paymentType === 'payment' || body.paymentType === 'note_payment') {
      if (Math.abs(applied - writeOff - discount - body.amount) > 0.02) throw validation('Amount paid + write-off + discount must equal the total applied to bills');
    }
    const sys = await sysAccounts(req.user.tenantId, ['accounts_payable', 'payable_write_off', 'discount_received', 'vendor_advance']);
    const settings = await getSettings(req.user.tenantId);
    const advanceAccountId = settings.vendorAdvanceAccountId ?? sys('vendor_advance');
    const row = await db.transaction(async (tx) => {
      const [created] = await tx.insert(schema.vendorPayments).values({ ...toRow(body), tenantId: req.user.tenantId, seriesId, number, status: body.saveStatus, contactSnapshot: contactSnapshot(contact), createdBy: req.user.id }).returning();
      if (body.saveStatus === 'paid') {
        for (const a of body.allocations) {
          const T = a.docType === 'debit_note' ? schema.debitNotes : schema.purchaseBills;
          const [doc] = await tx.select().from(T as any).where(eq((T as any).id, a.docId));
          if (doc) {
            const paid = n((doc as any).amountPaid) + a.amountApplied;
            const balance = n((doc as any).totalAmount) - paid;
            await tx.update(T as any).set({ amountPaid: s2(paid), balanceDue: s2(Math.max(0, balance)), status: balance <= 0.02 ? 'paid' : 'partially_paid', updatedAt: new Date() }).where(eq((T as any).id, a.docId));
          }
        }
        const jLines: any[] = [];
        if (body.paymentType === 'advance') { jLines.push({ accountId: advanceAccountId, debit: body.amount, contactId: body.contactId }, { accountId: body.bankAccountId, credit: body.amount }); }
        else if (body.paymentType === 'refund') { jLines.push({ accountId: body.bankAccountId, debit: body.amount }, { accountId: sys('accounts_payable')!, credit: body.amount, contactId: body.contactId }); }
        else { jLines.push({ accountId: sys('accounts_payable')!, debit: applied, contactId: body.contactId }, { accountId: body.bankAccountId, credit: body.amount }); if (writeOff > 0.004) jLines.push({ accountId: sys('payable_write_off')!, credit: writeOff }); if (discount > 0.004) jLines.push({ accountId: sys('discount_received')!, credit: discount }); }
        await postJournal(tx as any, { tenantId: req.user.tenantId, firmId: body.firmId, branchId: body.branchId, date: body.paymentDate, refType: 'vendor_payment', refId: created.id, refNumber: number, description: `Vendor Payment ${number}`, createdBy: req.user.id, lines: jLines });
      }
      return created;
    });
    await logActivity(req, 'vendor_payment', row.id, 'created', `Vendor Payment ${row.number} created`);
    return ok(row, 'Vendor Payment created successfully');
  });

  app.delete('/api/accounting/purchase/vendor-payments/:id', { preHandler: app.requirePermission('acc_vendor_payments', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    const [r] = await db.select().from(schema.vendorPayments).where(and(eq(schema.vendorPayments.id, id), eq(schema.vendorPayments.tenantId, req.user.tenantId)));
    if (!r) throw notFound('Vendor Payment');
    await db.transaction(async (tx) => {
      for (const a of r.allocations as any[]) {
        const T = a.docType === 'debit_note' ? schema.debitNotes : schema.purchaseBills;
        const [doc] = await tx.select().from(T as any).where(eq((T as any).id, a.docId));
        if (doc) { const paid = Math.max(0, n((doc as any).amountPaid) - a.amountApplied); const balance = n((doc as any).totalAmount) - paid; await tx.update(T as any).set({ amountPaid: s2(paid), balanceDue: s2(balance), status: paid <= 0.004 ? 'open' : 'partially_paid', updatedAt: new Date() }).where(eq((T as any).id, a.docId)); }
      }
      await reverseJournal(tx as any, req.user.tenantId, 'vendor_payment', id);
      await tx.delete(schema.vendorPayments).where(eq(schema.vendorPayments.id, id));
    });
    await logActivity(req, 'vendor_payment', id, 'deleted', `Vendor Payment ${r.number} deleted`);
    return ok(null, 'Vendor Payment deleted');
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
