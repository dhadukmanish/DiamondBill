import { pgTable, uuid, text, boolean, timestamp, integer, jsonb, date, numeric } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants, firms, users, accounts, contacts } from './core';

const ts = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};
const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const pct = (name: string) => numeric(name, { precision: 8, scale: 4 });

/** Tax groups — individual GST rates and composite groups. */
export const taxGroups = pgTable('tax_groups', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  taxType: text('tax_type').notNull().default('gst'), // gst | vat | sales tax | service tax | custom | out_of_scope
  gstCategory: text('gst_category').notNull().default('intra_state'), // intra_state | inter_state
  rate: pct('rate').notNull().default('0'), // effective total rate
  cgstRate: pct('cgst_rate').notNull().default('0'),
  sgstRate: pct('sgst_rate').notNull().default('0'),
  igstRate: pct('igst_rate').notNull().default('0'),
  cessRate: pct('cess_rate').notNull().default('0'),
  isComposite: boolean('is_composite').notNull().default(false),
  componentIds: jsonb('component_ids').$type<string[]>().notNull().default([]),
  remark: text('remark'),
  isSystem: boolean('is_system').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  ...ts,
});

/** TDS / TCS rates (kind discriminates). */
export const withholdingRates = pgTable('withholding_rates', {
  id: id(),
  tenantId: tenantId(),
  kind: text('kind').notNull(), // tds | tcs
  name: text('name').notNull(),
  section: text('section').notNull(),
  rate: pct('rate').notNull(),
  payableAccountId: uuid('payable_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  receivableAccountId: uuid('receivable_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  effectiveFrom: date('effective_from'),
  effectiveTo: date('effective_to'),
  isActive: boolean('is_active').notNull().default(true),
  ...ts,
});

export const units = pgTable('units', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  uqcCode: text('uqc_code').notNull(),
  decimalPlaces: integer('decimal_places').notNull().default(2),
  conversions: jsonb('conversions').$type<{ toUnitId: string; factor: number }[]>().notNull().default([]),
  isSystem: boolean('is_system').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  ...ts,
});

export const productCategories = pgTable('product_categories', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  serialNo: integer('serial_no').notNull().default(1),
  parentId: uuid('parent_id'),
  isActive: boolean('is_active').notNull().default(true),
  ...ts,
});

export const labs = pgTable('labs', {
  id: id(),
  tenantId: tenantId(),
  labType: text('lab_type').notNull(), // gia | igi | hrd | idl | egl | other
  labName: text('lab_name').notNull(),
  defaultVendorId: uuid('default_vendor_id').references(() => contacts.id, { onDelete: 'set null' }),
  isActive: boolean('is_active').notNull().default(true),
  ...ts,
});

export const salesPersons = pgTable('sales_persons', {
  id: id(),
  tenantId: tenantId(),
  firmId: uuid('firm_id').references(() => firms.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  remark: text('remark'),
  isActive: boolean('is_active').notNull().default(true),
  ...ts,
});

export const termsConditions = pgTable('terms_conditions', {
  id: id(),
  tenantId: tenantId(),
  firmId: uuid('firm_id').references(() => firms.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  documentType: text('document_type').notNull(), // invoice | estimate | proforma | sales_order | purchase_order | purchase_bill | credit_note | debit_note | ...
  taxType: text('tax_type').notNull().default('both'), // regulated | unregulated | both
  content: text('content').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  ...ts,
});

export const chequeBooks = pgTable('cheque_books', {
  id: id(),
  tenantId: tenantId(),
  bankAccountId: uuid('bank_account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  fromNo: integer('from_no').notNull(),
  toNo: integer('to_no').notNull(),
  nextNo: integer('next_no').notNull(),
  usedNos: jsonb('used_nos').$type<number[]>().notNull().default([]),
  isDefault: boolean('is_default').notNull().default(false),
  ...ts,
});

export const carriers = pgTable('carriers', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  trackingUrl: text('tracking_url'),
  isActive: boolean('is_active').notNull().default(true),
  ...ts,
});

export const shipmentStatuses = pgTable('shipment_statuses', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  statusType: text('status_type').notNull(), // shipped | delivered
  isSystem: boolean('is_system').notNull().default(false),
  ...ts,
});

export const paymentModes = pgTable('payment_modes', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  isSystem: boolean('is_system').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  ...ts,
});

export const paymentTerms = pgTable('payment_terms', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  days: integer('days').notNull().default(0),
  isSystem: boolean('is_system').notNull().default(false),
  ...ts,
});

/** Product processes (general / lab / pricing behaviours). */
export const processes = pgTable('processes', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  behavior: text('behavior').notNull().default('general'), // general | lab | pricing
  returnStatus: text('return_status').notNull().default('available'), // available | keep_in_process
  autoReturn: boolean('auto_return').notNull().default(false),
  sequence: integer('sequence').notNull().default(1),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  ...ts,
});

/** Price lists (per stock type, per sub-product prices filled in Phase 2). */
export const priceLists = pgTable('price_lists', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  stockTypes: jsonb('stock_types').$type<string[]>().notNull().default([]),
  currency: text('currency').notNull().default('INR'),
  isActive: boolean('is_active').notNull().default(true),
  ...ts,
});

/** Product name templates per stock type. */
export const productNameTemplates = pgTable('product_name_templates', {
  id: id(),
  tenantId: tenantId(),
  stockType: text('stock_type').notNull(), // general | loose_diamond | certified | metal | stone | jewellery
  productTemplate: text('product_template').notNull().default('##Product Name##'),
  subProductTemplate: text('sub_product_template').notNull().default('##Product Name## - ##Serial##'),
  ...ts,
});
