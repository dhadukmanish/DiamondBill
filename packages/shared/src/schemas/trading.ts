import { z } from 'zod';

const uuidOpt = z.string().uuid().optional().nullable();
const num = z.coerce.number();
const str = z.string().optional().nullable();

/** One line of a trading document's item grid. Matches the TransactionForm / LineItemsGrid shape. */
export const docLineSchema = z.object({
  productId: z.string().uuid(),
  productItemId: z.string().uuid(),
  productName: str,
  itemName: str,
  sku: str,
  description: str,
  hsnCode: str,
  accountId: uuidOpt,
  qty: num.positive('Quantity must be greater than zero'),
  unitId: uuidOpt,
  rate: num.min(0),
  discountType: z.enum(['none', 'flat', 'percent']).default('none'),
  discountValue: num.min(0).default(0),
  discountAmount: num.default(0),
  taxGroupId: uuidOpt,
  taxAmount: num.default(0),
  cgstAmount: num.default(0),
  sgstAmount: num.default(0),
  igstAmount: num.default(0),
  cessAmount: num.default(0),
  amount: num.default(0),
  customFields: z.record(z.any()).default({}),
});
export type DocLine = z.infer<typeof docLineSchema>;

/** Fields shared by every trading document header (Purchase/Sales Memo, Return, Bill/Invoice, Debit/Credit Note). */
const docBase = {
  firmId: z.string().uuid('Firm is required'),
  branchId: z.string().uuid('Branch is required'),
  seriesId: uuidOpt,
  number: str,
  referenceNumber: str,
  docDate: z.string().min(1, 'Date is required'),
  contactId: z.string().uuid('Party is required'),
  shippingAddress: z.record(z.any()).default({}),
  salesPersonId: uuidOpt,
  brokerId: uuidOpt,
  brokerageType: z.enum(['percent', 'amount']).default('percent'),
  brokerageValue: num.min(0).default(0),
  paymentTermsId: uuidOpt,
  dueDate: str,
  currencyCode: z.string().default('INR'),
  exchangeRate: num.positive().default(1),
  taxType: z.enum(['exclusive', 'inclusive']).default('exclusive'),
  discountType: z.enum(['none', 'flat', 'percent']).default('none'),
  discountValue: num.min(0).default(0),
  tdsRateId: uuidOpt,
  tcsRateId: uuidOpt,
  adjustment: num.default(0),
  shippingCharge: num.min(0).default(0),
  notes: str,
  printableNotes: str,
  attachments: z.array(z.any()).default([]),
  customFields: z.record(z.any()).default({}),
  lines: z.array(docLineSchema).min(1, 'Add at least one line'),
  saveStatus: z.enum(['draft', 'open']).default('open'),
};

export const purchaseOrderSchema = z.object({ ...docBase, expectedDate: str });
export const purchaseOrderReturnSchema = z.object({ ...docBase, purchaseOrderId: uuidOpt });
export const purchaseBillSchema = z.object({ ...docBase, purchaseOrderId: uuidOpt });
export const debitNoteSchema = z.object({ ...docBase, purchaseBillId: uuidOpt, reason: str, amountCorrectionOnly: z.boolean().default(false) });

export const salesOrderSchema = z.object({ ...docBase, expectedDate: str, rejectionPercent: num.min(0).max(100).default(0) });
export const salesOrderReturnSchema = z.object({ ...docBase, salesOrderId: uuidOpt });
export const invoiceSchema = z.object({ ...docBase, salesOrderId: uuidOpt, consignee: z.record(z.any()).default({}) });
export const creditNoteSchema = z.object({ ...docBase, invoiceId: uuidOpt, reason: str, amountCorrectionOnly: z.boolean().default(false) });

/** One line of a payment's bill-allocation table. */
export const paymentAllocationSchema = z.object({
  docType: z.string(), // purchase_bill | debit_note | invoice | credit_note
  docId: z.string().uuid(),
  docNumber: str,
  billAmount: num.default(0),
  amountDue: num.default(0),
  amountApplied: num.min(0).default(0),
  writeOffAmount: num.min(0).default(0),
  discountAmount: num.min(0).default(0),
  tdsAmount: num.min(0).default(0),
  tcsAmount: num.min(0).default(0),
});

const paymentBase = {
  firmId: z.string().uuid('Firm is required'),
  branchId: z.string().uuid('Branch is required'),
  seriesId: uuidOpt,
  number: str,
  paymentDate: z.string().min(1, 'Date is required'),
  contactId: z.string().uuid('Party is required'),
  paymentType: z.enum(['payment', 'note_payment', 'advance', 'refund']).default('payment'),
  paymentModeId: uuidOpt,
  amount: num.positive('Amount must be greater than zero'),
  currencyCode: z.string().default('INR'),
  exchangeRate: num.positive().default(1),
  referenceNumber: str,
  notes: str,
  attachments: z.array(z.any()).default([]),
  advanceApplied: num.min(0).default(0),
  allocations: z.array(paymentAllocationSchema).default([]),
  saveStatus: z.enum(['draft', 'paid']).default('paid'),
};
export const vendorPaymentSchema = z.object({ ...paymentBase, bankAccountId: z.string().uuid('Paid Through account is required') });
export const customerPaymentSchema = z.object({ ...paymentBase, depositToAccountId: z.string().uuid('Deposit To account is required') });

export const DOC_TYPE_LABELS: Record<string, string> = {
  purchase_order: 'Purchase Memo',
  purchase_order_return: 'Purchase Memo Return',
  purchase_bill: 'Purchase Bill',
  debit_note: 'Debit Note',
  vendor_payment: 'Vendor Payment',
  sales_order: 'Sales Memo',
  sales_order_return: 'Sales Memo Return',
  invoice: 'Invoice',
  credit_note: 'Credit Note',
  customer_payment: 'Customer Payment',
};
export const DOC_STATUS_LABELS: Record<string, string> = { draft: 'Draft', open: 'Open', partially_paid: 'Partially Paid', paid: 'Paid', cancelled: 'Cancelled', closed: 'Closed', converted: 'Converted' };
export const DOC_STATUS_COLORS: Record<string, 'gray' | 'blue' | 'amber' | 'green' | 'red' | 'purple'> = { draft: 'gray', open: 'blue', partially_paid: 'amber', paid: 'green', cancelled: 'red', closed: 'gray', converted: 'purple' };
