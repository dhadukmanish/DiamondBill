import { pgTable, uuid, text, boolean, timestamp, integer, jsonb, date, numeric, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants, firms, branches, users, accounts, contacts, series } from './core';

const ts = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};
const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const money = (name: string) => numeric(name, { precision: 18, scale: 4 });
const pct = (name: string) => numeric(name, { precision: 8, scale: 4 });

/**
 * Columns shared by every trading document (Purchase/Sales Memo, Memo Return, Bill/Invoice, Debit/Credit Note).
 * `lines` holds the item grid as JSON (mirrors the Stock Adjustment/Transfer convention from Phase 2) — the
 * per-line shape is the `docLineSchema` in packages/shared/src/schemas/trading.ts.
 */
function docCols() {
  return {
    id: id(),
    tenantId: tenantId(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    seriesId: uuid('series_id').references(() => series.id, { onDelete: 'set null' }),
    number: text('number').notNull(),
    referenceNumber: text('reference_number'),
    docDate: date('doc_date').notNull(),
    contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'restrict' }),
    contactSnapshot: jsonb('contact_snapshot').notNull().default({}), // {name, phone, gstin} at time of save
    shippingAddress: jsonb('shipping_address').notNull().default({}),
    salesPersonId: uuid('sales_person_id'),
    brokerId: uuid('broker_id'),
    brokerageType: text('brokerage_type').notNull().default('percent'), // percent | amount
    brokerageValue: money('brokerage_value').notNull().default('0'),
    brokerageAmount: money('brokerage_amount').notNull().default('0'),
    paymentTermsId: uuid('payment_terms_id'),
    dueDate: date('due_date'),
    currencyCode: text('currency_code').notNull().default('INR'),
    exchangeRate: numeric('exchange_rate', { precision: 18, scale: 6 }).notNull().default('1'),
    taxType: text('tax_type').notNull().default('exclusive'), // exclusive | inclusive
    subtotal: money('subtotal').notNull().default('0'),
    discountType: text('discount_type').notNull().default('none'), // none | flat | percent
    discountValue: pct('discount_value').notNull().default('0'),
    discountAmount: money('discount_amount').notNull().default('0'),
    taxAmount: money('tax_amount').notNull().default('0'),
    tdsRateId: uuid('tds_rate_id'),
    tdsAmount: money('tds_amount').notNull().default('0'),
    tcsRateId: uuid('tcs_rate_id'),
    tcsAmount: money('tcs_amount').notNull().default('0'),
    adjustment: money('adjustment').notNull().default('0'),
    shippingCharge: money('shipping_charge').notNull().default('0'),
    totalAmount: money('total_amount').notNull().default('0'),
    amountPaid: money('amount_paid').notNull().default('0'),
    balanceDue: money('balance_due').notNull().default('0'),
    status: text('status').notNull().default('draft'), // draft | open | partially_paid | paid | cancelled | closed | converted
    notes: text('notes'),
    printableNotes: text('printable_notes'),
    attachments: jsonb('attachments').notNull().default([]),
    customFields: jsonb('custom_fields').notNull().default({}),
    lines: jsonb('lines').notNull().default([]),
    journalEntryId: uuid('journal_entry_id'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...ts,
  };
}

/* ==================== Journal (double-entry ledger) ==================== */

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: id(),
    tenantId: tenantId(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    entryDate: date('entry_date').notNull(),
    refType: text('ref_type').notNull(), // purchase_bill | invoice | credit_note | debit_note | vendor_payment | customer_payment | ...
    refId: uuid('ref_id').notNull(),
    refNumber: text('ref_number'),
    description: text('description').notNull().default(''),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('journal_ref_idx').on(t.tenantId, t.refType, t.refId), index('journal_firm_date_idx').on(t.tenantId, t.firmId, t.entryDate)],
);

export const journalLines = pgTable(
  'journal_lines',
  {
    id: id(),
    tenantId: tenantId(),
    journalEntryId: uuid('journal_entry_id').notNull().references(() => journalEntries.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'restrict' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }), // AR/AP sub-ledger
    debit: money('debit').notNull().default('0'),
    credit: money('credit').notNull().default('0'),
    description: text('description'),
    lineOrder: integer('line_order').notNull().default(0),
  },
  (t) => [index('journal_line_account_idx').on(t.tenantId, t.accountId), index('journal_line_contact_idx').on(t.tenantId, t.contactId), index('journal_line_entry_idx').on(t.journalEntryId)],
);

/* ==================== Purchase ==================== */

/** Purchase Memo — a vendor order commitment. No stock/journal effect; commits poCommitted on stock. */
export const purchaseOrders = pgTable('purchase_orders', { ...docCols(), expectedDate: date('expected_date') }, (t) => [
  uniqueIndex('purchase_orders_number_idx').on(t.tenantId, t.number),
  index('purchase_orders_contact_idx').on(t.tenantId, t.contactId),
]);

/** Purchase Memo Return — cancels a pending memo commitment (in full or part). */
export const purchaseOrderReturns = pgTable('purchase_order_returns', { ...docCols(), purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, { onDelete: 'set null' }) }, (t) => [
  uniqueIndex('po_returns_number_idx').on(t.tenantId, t.number),
]);

/** Purchase Bill — vendor invoice. Stock-in (FIFO) + journal (Inventory Asset Dr / Accounts Payable Cr). */
export const purchaseBills = pgTable('purchase_bills', { ...docCols(), purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, { onDelete: 'set null' }) }, (t) => [
  uniqueIndex('purchase_bills_number_idx').on(t.tenantId, t.number),
  index('purchase_bills_contact_idx').on(t.tenantId, t.contactId),
  index('purchase_bills_status_idx').on(t.tenantId, t.status),
]);

/** Debit Note — reduces a vendor bill (return or price correction). */
export const debitNotes = pgTable('debit_notes', { ...docCols(), purchaseBillId: uuid('purchase_bill_id').references(() => purchaseBills.id, { onDelete: 'set null' }), reason: text('reason'), amountCorrectionOnly: boolean('amount_correction_only').notNull().default(false) }, (t) => [
  uniqueIndex('debit_notes_number_idx').on(t.tenantId, t.number),
]);

/** Vendor Payment — pays down one or more bills/debit notes (bill-to-bill) or sits on account (advance). */
export const vendorPayments = pgTable(
  'vendor_payments',
  {
    id: id(),
    tenantId: tenantId(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    seriesId: uuid('series_id').references(() => series.id, { onDelete: 'set null' }),
    number: text('number').notNull(),
    paymentDate: date('payment_date').notNull(),
    contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'restrict' }),
    contactSnapshot: jsonb('contact_snapshot').notNull().default({}),
    paymentType: text('payment_type').notNull().default('payment'), // payment | note_payment | advance | refund
    paymentModeId: uuid('payment_mode_id'),
    bankAccountId: uuid('bank_account_id').notNull().references(() => accounts.id, { onDelete: 'restrict' }), // "Paid Through"
    amount: money('amount').notNull(),
    currencyCode: text('currency_code').notNull().default('INR'),
    exchangeRate: numeric('exchange_rate', { precision: 18, scale: 6 }).notNull().default('1'),
    referenceNumber: text('reference_number'),
    notes: text('notes'),
    attachments: jsonb('attachments').notNull().default([]),
    advanceApplied: money('advance_applied').notNull().default('0'),
    excessAmount: money('excess_amount').notNull().default('0'),
    allocations: jsonb('allocations').notNull().default([]), // [{docType, docId, docNumber, billAmount, amountDue, amountApplied, writeOffAmount, discountAmount, tdsAmount, tcsAmount}]
    status: text('status').notNull().default('draft'), // draft | paid
    journalEntryId: uuid('journal_entry_id'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...ts,
  },
  (t) => [uniqueIndex('vendor_payments_number_idx').on(t.tenantId, t.number), index('vendor_payments_contact_idx').on(t.tenantId, t.contactId)],
);

/* ==================== Sales ==================== */

/** Sales Memo — a customer order commitment. No stock/journal effect; commits soCommitted / memo lines on stock. */
export const salesOrders = pgTable('sales_orders', { ...docCols(), expectedDate: date('expected_date'), rejectionPercent: pct('rejection_percent').notNull().default('0') }, (t) => [
  uniqueIndex('sales_orders_number_idx').on(t.tenantId, t.number),
  index('sales_orders_contact_idx').on(t.tenantId, t.contactId),
]);

/** Sales Memo Return — returns previously memo'd-out stock. */
export const salesOrderReturns = pgTable('sales_order_returns', { ...docCols(), salesOrderId: uuid('sales_order_id').references(() => salesOrders.id, { onDelete: 'set null' }) }, (t) => [
  uniqueIndex('so_returns_number_idx').on(t.tenantId, t.number),
]);

/** Invoice — customer bill. Stock-out (FIFO) + journal (AR Dr / Sales Cr / COGS Dr / Inventory Asset Cr). */
export const invoices = pgTable('invoices', { ...docCols(), salesOrderId: uuid('sales_order_id').references(() => salesOrders.id, { onDelete: 'set null' }), consignee: jsonb('consignee').notNull().default({}) }, (t) => [
  uniqueIndex('invoices_number_idx').on(t.tenantId, t.number),
  index('invoices_contact_idx').on(t.tenantId, t.contactId),
  index('invoices_status_idx').on(t.tenantId, t.status),
]);

/** Credit Note — reduces a customer invoice (return or price correction). Returns stock in (FIFO cost at invoice rate). */
export const creditNotes = pgTable('credit_notes', { ...docCols(), invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }), reason: text('reason'), amountCorrectionOnly: boolean('amount_correction_only').notNull().default(false) }, (t) => [
  uniqueIndex('credit_notes_number_idx').on(t.tenantId, t.number),
]);

/** Customer Payment — receives against one or more invoices/credit notes (bill-to-bill) or sits on account (advance). */
export const customerPayments = pgTable(
  'customer_payments',
  {
    id: id(),
    tenantId: tenantId(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    seriesId: uuid('series_id').references(() => series.id, { onDelete: 'set null' }),
    number: text('number').notNull(),
    paymentDate: date('payment_date').notNull(),
    contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'restrict' }),
    contactSnapshot: jsonb('contact_snapshot').notNull().default({}),
    paymentType: text('payment_type').notNull().default('payment'), // payment | note_payment | advance | refund
    paymentModeId: uuid('payment_mode_id'),
    depositToAccountId: uuid('deposit_to_account_id').notNull().references(() => accounts.id, { onDelete: 'restrict' }),
    amount: money('amount').notNull(),
    currencyCode: text('currency_code').notNull().default('INR'),
    exchangeRate: numeric('exchange_rate', { precision: 18, scale: 6 }).notNull().default('1'),
    referenceNumber: text('reference_number'),
    notes: text('notes'),
    attachments: jsonb('attachments').notNull().default([]),
    advanceApplied: money('advance_applied').notNull().default('0'),
    excessAmount: money('excess_amount').notNull().default('0'),
    allocations: jsonb('allocations').notNull().default([]),
    status: text('status').notNull().default('draft'), // draft | paid
    journalEntryId: uuid('journal_entry_id'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...ts,
  },
  (t) => [uniqueIndex('customer_payments_number_idx').on(t.tenantId, t.number), index('customer_payments_contact_idx').on(t.tenantId, t.contactId)],
);
