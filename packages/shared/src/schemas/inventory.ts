import { z } from 'zod';
import { PRODUCT_STOCK_TYPES, STOCK_STATUSES } from '../enums.js';

const uuidOpt = z.string().uuid().optional().nullable();
const num = z.coerce.number();
const str = z.string().optional().nullable();

export const productItemSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Sub-product name is required'),
  sku: z.string().min(1, 'SKU is required'),
  barcode: str,
  purchasePrice: num.min(0).default(0),
  sellingPrice: num.min(0).default(0),
  mrp: num.optional().nullable(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  customFields: z.record(z.any()).default({}),
});

export const productSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  productType: z.enum(['goods', 'service']).default('goods'),
  stockType: z.enum(PRODUCT_STOCK_TYPES).default('general'),
  serialNo: num.int().optional().nullable(),
  unitId: uuidOpt,
  hsnCode: str,
  categoryIds: z.array(z.string().uuid()).default([]),
  shortDescription: str,
  details: str,
  trackingType: z.enum(['sku', 'serialized', 'batch']).default('sku'),
  purchaseAccountId: uuidOpt,
  salesAccountId: uuidOpt,
  purchasePrice: num.min(0).default(0),
  sellingPrice: num.min(0).default(0),
  currency: z.string().min(3).default('INR'),
  taxGroupId: uuidOpt,
  stockStatus: z.enum(STOCK_STATUSES).default('available'),
  images: z.array(z.string()).default([]),
  lowStockQty: num.optional().nullable(),
  isActive: z.boolean().default(true),
  customFields: z.record(z.any()).default({}),
  items: z.array(productItemSchema).default([]),
});
export type ProductInput = z.infer<typeof productSchema>;

export const CERTIFIED_STATUSES = ['available', 'on_hold', 'in_process', 'lab', 'memo', 'sold', 'disabled'] as const;
export const CERTIFIED_STATUS_LABELS: Record<(typeof CERTIFIED_STATUSES)[number], string> = { available: 'Available', on_hold: 'On Hold', in_process: 'In Process', lab: 'At Lab', memo: 'On Memo', sold: 'Sold', disabled: 'Disabled' };

/** One certified stone = product (stockType certified) + single item. */
export const certifiedProductSchema = z.object({
  name: str,
  itemName: str,
  sku: z.string().min(1, 'SKU is required'),
  stockStatus: z.enum(STOCK_STATUSES).default('available'),
  hsnCode: str,
  unitId: uuidOpt,
  taxGroupId: uuidOpt,
  currency: z.string().min(3).default('INR'),
  categoryIds: z.array(z.string().uuid()).default([]),
  labId: uuidOpt,
  certificateNo: str,
  salesAccountId: z.string().uuid('Sales account is required'),
  purchaseAccountId: z.string().uuid('Purchase account is required'),
  purchasePrice: num.min(0).default(0), // per ct
  sellingPrice: num.min(0).default(0), // per ct
  rapaportPrice: num.optional().nullable(),
  rapBack: num.optional().nullable(),
  discountType: z.enum(['percent', 'amount']).default('percent'),
  discountValue: num.default(0),
  weight: num.positive('Weight (ct) is required'),
  firmId: z.string().uuid('Firm is required'),
  branchId: z.string().uuid('Branch is required'),
  addStock: z.boolean().default(true),
  stockDate: z.string().optional().nullable(),
  description: str,
  customFields: z.record(z.any()).default({}),
});
export type CertifiedProductInput = z.infer<typeof certifiedProductSchema>;

export const holdSchema = z.object({ holdCustomerId: uuidOpt, holdBrokerId: uuidOpt, note: str });

export const openingStockSchema = z.object({
  firmId: z.string().uuid('Firm is required'),
  branchId: z.string().uuid('Branch is required'),
  fiscalYearId: z.string().uuid('Financial year is required'),
  lines: z.array(z.object({ productItemId: z.string().uuid(), qty: num.min(0), rate: num.min(0), currency: z.string().default('INR'), exchangeRate: num.positive().default(1) })).min(1),
});

export const ADJUSTMENT_MODES = ['damaged', 'lost', 'found', 'correction', 'sample', 'expired', 'other'] as const;
export const stockAdjustmentSchema = z.object({
  firmId: z.string().uuid('Firm is required'),
  branchId: z.string().uuid('Branch is required'),
  seriesId: uuidOpt,
  number: str,
  adjustmentDate: z.string().min(1, 'Date is required'),
  referenceNo: str,
  mode: z.enum(ADJUSTMENT_MODES),
  note: str,
  lines: z.array(z.object({ productItemId: z.string().uuid(), qtyAdjusted: num.refine((v) => v !== 0, 'Adjusted qty cannot be zero'), rate: num.min(0).default(0) })).min(1, 'Add at least one line'),
});

export const stockTransferSchema = z.object({
  firmId: z.string().uuid('Firm is required'),
  branchId: z.string().uuid('From branch is required'),
  toFirmId: z.string().uuid('To firm is required'),
  toBranchId: z.string().uuid('To branch is required'),
  seriesId: uuidOpt,
  number: str,
  transferDate: z.string().min(1, 'Date is required'),
  referenceNo: str,
  notes: str,
  lines: z.array(z.object({ productItemId: z.string().uuid(), qty: num.positive(), unitPrice: num.min(0).default(0) })).min(1, 'Add at least one line'),
}).refine((v) => !(v.firmId === v.toFirmId && v.branchId === v.toBranchId), { message: 'Source and destination branch must differ', path: ['toBranchId'] });

export const itemTransferSchema = z.object({
  firmId: z.string().uuid('Firm is required'),
  branchId: z.string().uuid('Branch is required'),
  seriesId: uuidOpt,
  number: str,
  transferDate: z.string().min(1, 'Date is required'),
  referenceNo: str,
  notes: str,
  lines: z.array(z.object({ fromItemId: z.string().uuid(), toItemId: z.string().uuid(), qty: num.positive(), unitPrice: num.min(0).default(0) })).min(1, 'Add at least one line'),
});

export const stockTallySchema = z.object({
  firmId: z.string().uuid(),
  branchId: uuidOpt,
  tallyDate: z.string().min(1),
  counts: z.array(z.object({ productItemId: z.string().uuid(), countedQty: num.min(0) })),
});

export const rapaportSetSchema = z.object({
  shapes: z.array(z.string()).min(1),
  sizes: z.array(z.string()).min(1),
  mode: z.enum(['set', 'add', 'subtract']),
  value: num,
  colors: z.array(z.string()).optional(),
  clarities: z.array(z.string()).optional(),
});
export const rapaportGridSchema = z.object({
  shape: z.string().min(1),
  sizes: z.array(z.string()).min(1),
  cells: z.array(z.object({ color: z.string(), clarity: z.string(), price: num.min(0).optional(), additionalBack: num.optional() })),
});
export const rapaportCopySchema = z.object({ shape: z.string().min(1), fromSize: z.string().min(1), toSize: z.string().min(1) });
export const rapaportAdditionalBackSchema = z.object({ shape: z.string().min(1), sizes: z.array(z.string()).min(1), values: z.array(z.object({ fieldName: z.string(), optionValue: z.string(), backPercent: num })) });

export const RAP_COLORS = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'] as const;
export const RAP_CLARITIES = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'SI3', 'I1', 'I2', 'I3'] as const;
