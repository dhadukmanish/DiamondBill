import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { validation, notFound } from '../lib/errors';
import { consumeSeriesNumber } from '../routes/series';

const n = (v: unknown) => Number(v ?? 0);
const s4 = (v: number) => v.toFixed(4);

/** Reserve a document number: explicit `number` wins, else next of the default series for usedFor. Shared by purchase/sales routes. */
export async function docNumber(tenantId: string, firmId: string, usedFor: string, seriesId?: string | null, explicit?: string | null) {
  if (explicit?.trim()) return { number: explicit.trim(), seriesId: seriesId ?? null };
  let sid = seriesId;
  if (!sid) {
    const [s] = await db.select().from(schema.series).where(and(eq(schema.series.tenantId, tenantId), eq(schema.series.firmId, firmId), eq(schema.series.usedFor, usedFor))).orderBy(desc(schema.series.isDefault)).limit(1);
    if (!s) throw validation(`No series configured for ${usedFor.replace(/_/g, ' ')} — add one under Settings → Series`);
    sid = s.id;
  }
  const r = await consumeSeriesNumber(sid, tenantId);
  return { number: r.display, seriesId: sid };
}

export interface RawLine {
  productId: string;
  productItemId: string;
  qty: number;
  rate: number;
  discountType?: 'none' | 'flat' | 'percent';
  discountValue?: number;
  taxGroupId?: string | null;
  [k: string]: any;
}

/** Line-level discount + GST split (exclusive: tax added on top; inclusive: tax backed out of the rate). */
export function computeLine(line: RawLine, tax: { rate: number; cgstRate: number; sgstRate: number; igstRate: number; cessRate: number } | null, taxType: 'exclusive' | 'inclusive') {
  const gross = n(line.qty) * n(line.rate);
  const discountAmount = line.discountType === 'flat' ? n(line.discountValue) : line.discountType === 'percent' ? (gross * n(line.discountValue)) / 100 : 0;
  const netOfDiscount = Math.max(0, gross - discountAmount);
  const rate = n(tax?.rate);
  let taxable = netOfDiscount;
  if (taxType === 'inclusive' && rate > 0) taxable = netOfDiscount / (1 + rate / 100);
  const cgstAmount = (taxable * n(tax?.cgstRate)) / 100;
  const sgstAmount = (taxable * n(tax?.sgstRate)) / 100;
  const igstAmount = (taxable * n(tax?.igstRate)) / 100;
  const cessAmount = (taxable * n(tax?.cessRate)) / 100;
  const taxAmount = cgstAmount + sgstAmount + igstAmount + cessAmount;
  const amount = taxType === 'inclusive' ? netOfDiscount : taxable + taxAmount;
  return { discountAmount: r2(discountAmount), taxable: r2(taxable), cgstAmount: r2(cgstAmount), sgstAmount: r2(sgstAmount), igstAmount: r2(igstAmount), cessAmount: r2(cessAmount), taxAmount: r2(taxAmount), amount: r2(amount) };
}

/** Document-level totals from already-computed lines + header discount/TDS/TCS/adjustment/shipping. */
export function computeDocTotals(
  lineTotals: { taxable: number; taxAmount: number }[],
  header: { discountType: 'none' | 'flat' | 'percent'; discountValue: number; tdsRate?: number; tcsRate?: number; adjustment?: number; shippingCharge?: number },
) {
  const subtotal = r2(lineTotals.reduce((s, l) => s + l.taxable, 0));
  const lineTax = r2(lineTotals.reduce((s, l) => s + l.taxAmount, 0));
  const discountAmount = header.discountType === 'flat' ? n(header.discountValue) : header.discountType === 'percent' ? (subtotal * n(header.discountValue)) / 100 : 0;
  const taxableAfterDiscount = Math.max(0, subtotal - discountAmount);
  const tdsAmount = r2((taxableAfterDiscount * n(header.tdsRate)) / 100);
  const tcsAmount = r2((taxableAfterDiscount * n(header.tcsRate)) / 100);
  const adjustment = n(header.adjustment);
  const shippingCharge = n(header.shippingCharge);
  const totalAmount = r2(taxableAfterDiscount + lineTax + shippingCharge + adjustment - tdsAmount + tcsAmount);
  return { subtotal, discountAmount: r2(discountAmount), taxAmount: lineTax, tdsAmount, tcsAmount, totalAmount };
}

function r2(v: number) {
  return Math.round(v * 100) / 100;
}

/** Snapshot of a contact for a document header (name/phone/gstin as of save time). */
export function contactSnapshot(c: { companyName: string; phone: string | null; gstin: string | null } | undefined) {
  return c ? { name: c.companyName, phone: c.phone, gstin: c.gstin } : {};
}

/** Look up a tax group's rate breakdown, or null for "no tax" / missing. */
export async function taxGroupOf(tenantId: string, taxGroupId: string | null | undefined) {
  if (!taxGroupId) return null;
  const [t] = await db.select().from(schema.taxGroups).where(and(eq(schema.taxGroups.id, taxGroupId), eq(schema.taxGroups.tenantId, tenantId)));
  if (!t) return null;
  return { rate: n(t.rate), cgstRate: n(t.cgstRate), sgstRate: n(t.sgstRate), igstRate: n(t.igstRate), cessRate: n(t.cessRate) };
}

/** Names for a set of product items (used to snapshot productName/itemName/sku onto saved lines). */
export async function itemNames(tenantId: string, ids: string[]) {
  if (!ids.length) return new Map<string, { productName: string; itemName: string; sku: string }>();
  const I = schema.productItems, P = schema.products;
  const rows = await db.select({ id: I.id, itemName: I.name, sku: I.sku, productName: P.name }).from(I).innerJoin(P, eq(P.id, I.productId)).where(and(eq(I.tenantId, tenantId)));
  const wanted = new Set(ids);
  return new Map(rows.filter((r) => wanted.has(r.id)).map((r) => [r.id, r]));
}

export function assertFound<T>(row: T | undefined, label: string): T {
  if (!row) throw notFound(label);
  return row;
}

/** System account ids by systemKey (e.g. 'inventory_asset', 'sales', 'input_cgst'), for journal postings. */
export async function sysAccounts(tenantId: string, keys: string[]) {
  const rows = await db.select({ id: schema.accounts.id, systemKey: schema.accounts.systemKey }).from(schema.accounts).where(and(eq(schema.accounts.tenantId, tenantId), inArray(schema.accounts.systemKey, keys)));
  const map = new Map(rows.map((r) => [r.systemKey as string, r.id]));
  return (key: string) => map.get(key) ?? null;
}
