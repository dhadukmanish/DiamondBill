import type { Db } from '../db/client';
import { eq } from 'drizzle-orm';
import { schema } from '../db/client';
import { SYSTEM_ACCOUNTS, DEFAULT_FIRM_SETTINGS } from '../db/seed-data/coa';
import { ACCOUNT_NATURE_BY_TYPE, PAYMENT_MODES_DEFAULT } from '@diamondbill/shared';

/** Creates the default firm, branch, base currency, system accounts, default settings for a new tenant. */
export async function seedTenantDefaults(
  db: Db,
  tenantId: string,
  opts: { firmName: string; currency: string; countryCode: string; createdBy?: string },
) {
  const [firm] = await db
    .insert(schema.firms)
    .values({ tenantId, name: opts.firmName, isDefault: true, currency: opts.currency, countryCode: opts.countryCode })
    .returning();
  const [branch] = await db.insert(schema.branches).values({ tenantId, firmId: firm.id, name: opts.firmName, isDefault: true }).returning();
  // Default financial year (April–March, Indian FY) covering today
  const now = new Date();
  const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  await db.insert(schema.fiscalYears).values({ tenantId, firmId: firm.id, name: `${fyStartYear}-${String(fyStartYear + 1).slice(2)}`, startDate: `${fyStartYear}-04-01`, endDate: `${fyStartYear + 1}-03-31`, isActive: true });
  await db.insert(schema.currencies).values({
    tenantId,
    code: opts.currency,
    name: opts.currency === 'INR' ? 'Indian Rupee' : opts.currency,
    symbol: opts.currency === 'INR' ? '₹' : '$',
    decimalPlaces: 2,
    isBaseCurrency: true,
  });

  // chart of accounts (two passes for parents)
  const idByKey = new Map<string, string>();
  let order = 0;
  for (const a of SYSTEM_ACCOUNTS.filter((x) => !x.parentKey)) {
    const [row] = await db
      .insert(schema.accounts)
      .values({
        tenantId,
        name: a.name,
        accountType: a.type,
        accountSubType: a.subType,
        nature: ACCOUNT_NATURE_BY_TYPE[a.type],
        isGroup: !!a.isGroup,
        isSystem: !!a.isSystem,
        systemKey: a.key,
        currencyCode: opts.currency,
        displayOrder: order++,
        createdBy: opts.createdBy,
      })
      .returning({ id: schema.accounts.id });
    idByKey.set(a.key, row.id);
  }
  for (const a of SYSTEM_ACCOUNTS.filter((x) => x.parentKey)) {
    await db.insert(schema.accounts).values({
      tenantId,
      parentId: idByKey.get(a.parentKey!)!,
      name: a.name,
      accountType: a.type,
      accountSubType: a.subType,
      nature: ACCOUNT_NATURE_BY_TYPE[a.type],
      isSystem: !!a.isSystem,
      systemKey: a.key,
      currencyCode: opts.currency,
      displayOrder: order++,
      createdBy: opts.createdBy,
    });
  }

  await db.insert(schema.firmSettings).values({
    tenantId,
    settings: {
      ...DEFAULT_FIRM_SETTINGS,
      defaultReceivableAccountId: idByKey.get('accounts_receivable'),
      defaultPayableAccountId: idByKey.get('accounts_payable'),
      defaultRoundOffAccountId: idByKey.get('adjustment'),
      defaultSalesAccountId: idByKey.get('sales'),
      defaultPurchaseAccountId: idByKey.get('cogs'),
      defaultSalesDiscountAccountId: idByKey.get('discount_allowed'),
      defaultPurchaseDiscountAccountId: idByKey.get('discount_received'),
      customerAdvanceAccountId: idByKey.get('unearned_revenue'),
      vendorAdvanceAccountId: idByKey.get('prepaid_expense'),
      brokerageAdvanceAccountId: idByKey.get('brokerage_advance'),
      brokeragePayableAccountId: idByKey.get('brokerage_payable'),
      brokerageExpenseAccountId: idByKey.get('brokerage_expense'),
      inventoryAssetAccountId: idByKey.get('inventory_asset'),
    },
  });
  await seedMasterDefaults(db, tenantId);
  return { firm, branch };
}

/** Master defaults (taxes, units, shipment statuses, payment modes/terms, carriers). Idempotent — skips tables that already have rows for the tenant. */
export async function seedMasterDefaults(db: Db, tenantId: string) {
  const empty = async (t: any) => (await db.select({ id: t.id }).from(t).where(eq(t.tenantId, tenantId)).limit(1)).length === 0;
  if (await empty(schema.taxGroups)) await db.insert(schema.taxGroups).values([
    { tenantId, name: 'Out of Scope', taxType: 'out_of_scope', gstCategory: 'intra_state', rate: '0', isSystem: true },
    { tenantId, name: 'GST 3%', taxType: 'gst', gstCategory: 'intra_state', rate: '3', cgstRate: '1.5', sgstRate: '1.5' },
    { tenantId, name: 'IGST 3%', taxType: 'gst', gstCategory: 'inter_state', rate: '3', igstRate: '3' },
  ]);
  if (await empty(schema.units)) await db.insert(schema.units).values([
    { tenantId, name: 'Carat', uqcCode: 'CTM', decimalPlaces: 3, isSystem: true },
    { tenantId, name: 'Pieces', uqcCode: 'PCS', decimalPlaces: 0, isSystem: true },
    { tenantId, name: 'Grams', uqcCode: 'GMS', decimalPlaces: 3 },
  ]);
  if (await empty(schema.shipmentStatuses)) await db.insert(schema.shipmentStatuses).values([
    { tenantId, name: 'Shipped', statusType: 'shipped', isSystem: true },
    { tenantId, name: 'Delivered', statusType: 'delivered', isSystem: true },
  ]);
  if (await empty(schema.paymentModes)) await db.insert(schema.paymentModes).values(PAYMENT_MODES_DEFAULT.map((name) => ({ tenantId, name, isSystem: true })));
  if (await empty(schema.paymentTerms)) await db.insert(schema.paymentTerms).values([
    { tenantId, name: 'Due on Receipt', days: 0, isSystem: true },
    { tenantId, name: 'Net 15', days: 15, isSystem: true },
    { tenantId, name: 'Net 30', days: 30, isSystem: true },
    { tenantId, name: 'Net 45', days: 45, isSystem: true },
    { tenantId, name: 'Net 60', days: 60, isSystem: true },
  ]);
  if (await empty(schema.carriers)) await db.insert(schema.carriers).values([
    { tenantId, name: 'Blue Dart', trackingUrl: 'https://www.bluedart.com/tracking?awb={tracking_number}' },
    { tenantId, name: 'Sequel Logistics', trackingUrl: null },
    { tenantId, name: 'Brinks', trackingUrl: null },
  ]);
}
