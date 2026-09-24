import { pgTable, uuid, text, boolean, timestamp, integer, jsonb, date, numeric, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants, firms, branches, users, accounts, contacts, fiscalYears, series } from './core';
import { units, taxGroups, labs } from './masters';

const ts = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};
const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const qty = (name: string) => numeric(name, { precision: 18, scale: 4 });
const money = (name: string) => numeric(name, { precision: 18, scale: 4 });

/** Catalog product (goods/service). A product has one or more items (sub-products / variants / stones). */
export const products = pgTable(
  'products',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    productType: text('product_type').notNull().default('goods'), // goods | service
    stockType: text('stock_type').notNull().default('general'), // general | loose_diamond | certified | metal | stone | jewellery
    serialNo: integer('serial_no'),
    unitId: uuid('unit_id').references(() => units.id, { onDelete: 'set null' }),
    hsnCode: text('hsn_code'),
    categoryIds: jsonb('category_ids').$type<string[]>().notNull().default([]),
    shortDescription: text('short_description'),
    details: text('details'),
    trackingType: text('tracking_type').notNull().default('sku'), // sku | serialized | batch
    purchaseAccountId: uuid('purchase_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    salesAccountId: uuid('sales_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    purchasePrice: money('purchase_price').notNull().default('0'),
    sellingPrice: money('selling_price').notNull().default('0'),
    currency: text('currency').notNull().default('INR'),
    taxGroupId: uuid('tax_group_id').references(() => taxGroups.id, { onDelete: 'set null' }),
    stockStatus: text('stock_status').notNull().default('available'), // available | stock_out | temporary_stock_out | disable
    images: jsonb('images').$type<string[]>().notNull().default([]),
    lowStockQty: qty('low_stock_qty'),
    isActive: boolean('is_active').notNull().default(true),
    customFields: jsonb('custom_fields').$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...ts,
  },
  (t) => [index('products_tenant_idx').on(t.tenantId, t.stockType), index('products_name_idx').on(t.tenantId, t.name)],
);

/**
 * Sub-product / variant / single certified stone. Every stock movement references an item.
 * Certified stones carry their own firm/branch, weight, lab, pricing and hold status.
 */
export const productItems = pgTable(
  'product_items',
  {
    id: id(),
    tenantId: tenantId(),
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sku: text('sku').notNull(),
    barcode: text('barcode'),
    isDefault: boolean('is_default').notNull().default(false),
    purchasePrice: money('purchase_price').notNull().default('0'),
    sellingPrice: money('selling_price').notNull().default('0'),
    mrp: money('mrp'),
    // ---- certified stone fields ----
    firmId: uuid('firm_id').references(() => firms.id, { onDelete: 'set null' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    weight: qty('weight'), // carats
    labId: uuid('lab_id').references(() => labs.id, { onDelete: 'set null' }),
    certificateNo: text('certificate_no'),
    rapaportPrice: money('rapaport_price'), // $/ct list
    rapBack: numeric('rap_back', { precision: 8, scale: 4 }), // % back (negative = premium)
    pricePerCarat: money('price_per_carat'),
    discountType: text('discount_type').notNull().default('percent'), // percent | amount
    discountValue: numeric('discount_value', { precision: 12, scale: 4 }).notNull().default('0'),
    status: text('status').notNull().default('available'), // available | on_hold | in_process | lab | memo | sold | disabled
    holdCustomerId: uuid('hold_customer_id').references(() => contacts.id, { onDelete: 'set null' }),
    holdBrokerId: uuid('hold_broker_id').references(() => contacts.id, { onDelete: 'set null' }),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    customFields: jsonb('custom_fields').$type<Record<string, unknown>>().notNull().default({}),
    ...ts,
  },
  (t) => [uniqueIndex('product_items_sku_idx').on(t.tenantId, t.sku), index('product_items_product_idx').on(t.productId), index('product_items_status_idx').on(t.tenantId, t.status)],
);

/** FIFO cost layers. One lot per stock-in; qtyRemaining is consumed by stock-outs. */
export const stockLots = pgTable(
  'stock_lots',
  {
    id: id(),
    tenantId: tenantId(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    productItemId: uuid('product_item_id').notNull().references(() => productItems.id, { onDelete: 'cascade' }),
    lotDate: date('lot_date').notNull(),
    qtyIn: qty('qty_in').notNull(),
    qtyRemaining: qty('qty_remaining').notNull(),
    rate: money('rate').notNull(), // cost per unit in base currency
    sourceType: text('source_type').notNull(), // opening | purchase_bill | adjustment | transfer_in | item_transfer_in | sales_return | ...
    sourceId: uuid('source_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('stock_lots_item_idx').on(t.tenantId, t.firmId, t.branchId, t.productItemId, t.lotDate)],
);

/** Stock ledger — every quantity change, with FIFO allocations for outs. */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: id(),
    tenantId: tenantId(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    productItemId: uuid('product_item_id').notNull().references(() => productItems.id, { onDelete: 'cascade' }),
    movementDate: date('movement_date').notNull(),
    kind: text('kind').notNull(), // in | out | memo_out | memo_in | adjust_in | adjust_out | transfer_out | transfer_in | po_commit | po_release | so_commit | so_release
    qty: qty('qty').notNull(), // always positive; kind gives direction
    rate: money('rate').notNull().default('0'),
    value: money('value').notNull().default('0'), // qty × rate (COGS for outs)
    refType: text('ref_type').notNull(), // opening | adjustment | stock_transfer | item_transfer | purchase_bill | invoice | sales_order | ...
    refId: uuid('ref_id'),
    refNumber: text('ref_number'),
    allocations: jsonb('allocations').$type<{ lotId: string; qty: number; rate: number }[]>().notNull().default([]),
    note: text('note'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('stock_mov_item_idx').on(t.tenantId, t.productItemId, t.movementDate), index('stock_mov_ref_idx').on(t.refType, t.refId)],
);

/** Cached balances per firm/branch/item for fast list views (maintained by services/stock.ts). */
export const stockBalances = pgTable(
  'stock_balances',
  {
    id: id(),
    tenantId: tenantId(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    productItemId: uuid('product_item_id').notNull().references(() => productItems.id, { onDelete: 'cascade' }),
    totalIn: qty('total_in').notNull().default('0'),
    totalOut: qty('total_out').notNull().default('0'),
    qtyOnHand: qty('qty_on_hand').notNull().default('0'),
    memoOut: qty('memo_out').notNull().default('0'),
    memoIn: qty('memo_in').notNull().default('0'),
    soCommitted: qty('so_committed').notNull().default('0'),
    poCommitted: qty('po_committed').notNull().default('0'),
    value: money('value').notNull().default('0'), // FIFO cost of qty on hand
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('stock_bal_idx').on(t.firmId, t.branchId, t.productItemId), index('stock_bal_tenant_idx').on(t.tenantId)],
);

/** Opening stock header per firm + fiscal year (lines are movements with refType 'opening'). */
export const openingStocks = pgTable(
  'opening_stocks',
  {
    id: id(),
    tenantId: tenantId(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    fiscalYearId: uuid('fiscal_year_id').notNull().references(() => fiscalYears.id, { onDelete: 'cascade' }),
    productItemId: uuid('product_item_id').notNull().references(() => productItems.id, { onDelete: 'cascade' }),
    qty: qty('qty').notNull(),
    rate: money('rate').notNull(),
    currency: text('currency').notNull().default('INR'),
    exchangeRate: numeric('exchange_rate', { precision: 18, scale: 6 }).notNull().default('1'),
    ...ts,
  },
  (t) => [uniqueIndex('opening_stock_idx').on(t.firmId, t.branchId, t.fiscalYearId, t.productItemId)],
);

/** Stock adjustments (+/−) */
export const stockAdjustments = pgTable(
  'stock_adjustments',
  {
    id: id(),
    tenantId: tenantId(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    seriesId: uuid('series_id').references(() => series.id, { onDelete: 'set null' }),
    number: text('number').notNull(),
    adjustmentDate: date('adjustment_date').notNull(),
    referenceNo: text('reference_no'),
    mode: text('mode').notNull(), // damaged | lost | found | correction | sample | other
    note: text('note'),
    totalValue: money('total_value').notNull().default('0'),
    lines: jsonb('lines').$type<{ productItemId: string; productName: string; itemName: string; qtyAvailable: number; qtyAdjusted: number; rate: number }[]>().notNull().default([]),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...ts,
  },
  (t) => [index('stock_adj_idx').on(t.tenantId, t.firmId, t.adjustmentDate)],
);

/** Stock transfer between firm/branch (direct or approval flow) */
export const stockTransfers = pgTable(
  'stock_transfers',
  {
    id: id(),
    tenantId: tenantId(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    toFirmId: uuid('to_firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    toBranchId: uuid('to_branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    seriesId: uuid('series_id').references(() => series.id, { onDelete: 'set null' }),
    number: text('number').notNull(),
    transferDate: date('transfer_date').notNull(),
    referenceNo: text('reference_no'),
    status: text('status').notNull().default('completed'), // pending | completed | rejected
    notes: text('notes'),
    totalValue: money('total_value').notNull().default('0'),
    lines: jsonb('lines').$type<{ productItemId: string; productName: string; itemName: string; qty: number; unitPrice: number; total: number }[]>().notNull().default([]),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...ts,
  },
  (t) => [index('stock_transfer_idx').on(t.tenantId, t.firmId, t.transferDate)],
);

/** Product → product conversion (e.g. parcel → sized lots) */
export const itemTransfers = pgTable(
  'item_transfers',
  {
    id: id(),
    tenantId: tenantId(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    seriesId: uuid('series_id').references(() => series.id, { onDelete: 'set null' }),
    number: text('number').notNull(),
    transferDate: date('transfer_date').notNull(),
    referenceNo: text('reference_no'),
    notes: text('notes'),
    totalValue: money('total_value').notNull().default('0'),
    lines: jsonb('lines').$type<{ fromItemId: string; fromName: string; toItemId: string; toName: string; qty: number; unitPrice: number; total: number }[]>().notNull().default([]),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...ts,
  },
);

/** Physical count sessions (stock tally) */
export const stockTallies = pgTable(
  'stock_tallies',
  {
    id: id(),
    tenantId: tenantId(),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),
    tallyDate: date('tally_date').notNull(),
    productItemId: uuid('product_item_id').notNull().references(() => productItems.id, { onDelete: 'cascade' }),
    countedQty: qty('counted_qty').notNull(),
    systemQty: qty('system_qty').notNull(),
    countedBy: uuid('counted_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('stock_tally_idx').on(t.firmId, t.tallyDate, t.productItemId)],
);

/** Price list entries per item */
export const priceListItems = pgTable(
  'price_list_items',
  {
    id: id(),
    tenantId: tenantId(),
    priceListId: uuid('price_list_id').notNull(),
    productItemId: uuid('product_item_id').notNull().references(() => productItems.id, { onDelete: 'cascade' }),
    price: money('price').notNull(),
    effectiveFrom: date('effective_from'),
    ...ts,
  },
  (t) => [uniqueIndex('price_list_item_idx').on(t.priceListId, t.productItemId, t.effectiveFrom)],
);

/** Rapaport price grid: shape × size range × color × clarity → $/ct list price + additional back % */
export const rapaportPrices = pgTable(
  'rapaport_prices',
  {
    id: id(),
    tenantId: tenantId(),
    shape: text('shape').notNull(),
    size: text('size').notNull(), // repo rate size code e.g. "1.00-1.49"
    color: text('color').notNull(),
    clarity: text('clarity').notNull(),
    price: money('price').notNull().default('0'),
    additionalBack: numeric('additional_back', { precision: 8, scale: 4 }).notNull().default('0'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('rap_price_idx').on(t.tenantId, t.shape, t.size, t.color, t.clarity)],
);

/** Rapaport additional back by property value (e.g. fluorescence Strong → −5%) per shape × size */
export const rapaportAdditionalBacks = pgTable(
  'rapaport_additional_backs',
  {
    id: id(),
    tenantId: tenantId(),
    shape: text('shape').notNull(),
    size: text('size').notNull(),
    fieldName: text('field_name').notNull(), // custom field key flagged useInRapaportAdditionalBack
    optionValue: text('option_value').notNull(),
    backPercent: numeric('back_percent', { precision: 8, scale: 4 }).notNull().default('0'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('rap_ab_idx').on(t.tenantId, t.shape, t.size, t.fieldName, t.optionValue)],
);

/** Barcode / label settings per stock type */
export const barcodeSettings = pgTable(
  'barcode_settings',
  {
    id: id(),
    tenantId: tenantId(),
    stockType: text('stock_type').notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    ...ts,
  },
  (t) => [uniqueIndex('barcode_settings_idx').on(t.tenantId, t.stockType)],
);
