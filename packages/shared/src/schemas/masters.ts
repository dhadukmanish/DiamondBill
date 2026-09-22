import { z } from 'zod';
import { GST_CATEGORIES, LAB_TYPES, PROCESS_BEHAVIORS, PROCESS_RETURN_STATUSES, PRODUCT_STOCK_TYPES, TAX_TYPES } from '../enums.js';

const uuidOpt = z.string().uuid().optional().nullable();
const num = z.coerce.number();

export const taxGroupSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  taxType: z.enum(TAX_TYPES).default('gst'),
  gstCategory: z.enum(GST_CATEGORIES).default('intra_state'),
  rate: num.min(0).default(0),
  cgstRate: num.min(0).default(0),
  sgstRate: num.min(0).default(0),
  igstRate: num.min(0).default(0),
  cessRate: num.min(0).default(0),
  isComposite: z.boolean().default(false),
  componentIds: z.array(z.string().uuid()).default([]),
  remark: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const withholdingRateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  section: z.string().min(1, 'Section is required'),
  rate: num.min(0, 'Rate is required'),
  payableAccountId: uuidOpt,
  receivableAccountId: uuidOpt,
  effectiveFrom: z.string().optional().nullable(),
  effectiveTo: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const unitSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  uqcCode: z.string().min(1, 'UQC code is required'),
  decimalPlaces: z.coerce.number().int().min(0).max(6).default(2),
  conversions: z.array(z.object({ toUnitId: z.string().uuid(), factor: num.positive() })).default([]),
  isActive: z.boolean().default(true),
});

export const productCategorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  serialNo: z.coerce.number().int().min(1).default(1),
  parentId: uuidOpt,
  isActive: z.boolean().default(true),
});
export const productCategoryBulkSchema = z.object({ names: z.array(z.string().min(1)).min(1), parentId: uuidOpt });

export const labSchema = z.object({
  labType: z.enum(LAB_TYPES),
  labName: z.string().min(1, 'Lab name is required'),
  defaultVendorId: uuidOpt,
  isActive: z.boolean().default(true),
});

export const salesPersonSchema = z.object({
  firmId: uuidOpt,
  name: z.string().min(1, 'Name is required'),
  userId: uuidOpt,
  remark: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});
export const salesPersonBulkSchema = z.object({ firmId: uuidOpt, names: z.array(z.string().min(1)).min(1), userId: uuidOpt, remark: z.string().optional().nullable() });

export const TERMS_DOCUMENT_TYPES = ['invoice', 'estimate', 'proforma', 'sales_order', 'sales_order_return', 'purchase_order', 'purchase_order_return', 'purchase_bill', 'credit_note', 'debit_note', 'delivery_challan', 'package', 'shipment'] as const;
export const termsSchema = z.object({
  firmId: uuidOpt,
  name: z.string().min(1, 'Name is required'),
  documentType: z.enum(TERMS_DOCUMENT_TYPES),
  taxType: z.enum(['regulated', 'unregulated', 'both']).default('both'),
  content: z.string().min(1, 'Content is required'),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const chequeBookSchema = z
  .object({
    bankAccountId: z.string().uuid('Bank is required'),
    name: z.string().min(1, 'Name is required'),
    fromNo: z.coerce.number().int().min(1),
    toNo: z.coerce.number().int().min(1),
    isDefault: z.boolean().default(false),
  })
  .refine((v) => v.toNo >= v.fromNo, { message: 'To cheque no must be >= from cheque no', path: ['toNo'] });

export const carrierSchema = z.object({ name: z.string().min(1, 'Name is required'), trackingUrl: z.string().optional().nullable(), isActive: z.boolean().default(true) });
export const shipmentStatusSchema = z.object({ name: z.string().min(1, 'Name is required'), statusType: z.enum(['shipped', 'delivered']) });
export const paymentModeSchema = z.object({ name: z.string().min(1, 'Name is required'), isActive: z.boolean().default(true) });
export const paymentTermSchema = z.object({ name: z.string().min(1, 'Name is required'), days: z.coerce.number().int().min(0).default(0) });

export const processSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  behavior: z.enum(PROCESS_BEHAVIORS).default('general'),
  returnStatus: z.enum(PROCESS_RETURN_STATUSES).default('available'),
  autoReturn: z.boolean().default(false),
  sequence: z.coerce.number().int().min(1).default(1),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const priceListSchema = z.object({ name: z.string().min(1, 'Name is required'), stockTypes: z.array(z.enum(PRODUCT_STOCK_TYPES)).default([]), currency: z.string().min(3).default('INR'), isActive: z.boolean().default(true) });

export const productNameTemplateSchema = z.object({
  stockType: z.enum(PRODUCT_STOCK_TYPES),
  productTemplate: z.string().min(1),
  subProductTemplate: z.string().min(1).refine((t) => /##(Serial|Stock Id|Barcode|Product Code)##/.test(t), 'Sub-product template must include a unique token (##Serial##, ##Stock Id##, ##Barcode## or ##Product Code##)'),
});
