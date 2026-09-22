import type { Db } from '../db/client.js';
import { schema } from '../db/client.js';
import { SYSTEM_ACCOUNTS, DEFAULT_FIRM_SETTINGS } from '../db/seed-data/coa.js';
import { ACCOUNT_NATURE_BY_TYPE } from '@diamondbill/shared';

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
  return { firm, branch };
}
