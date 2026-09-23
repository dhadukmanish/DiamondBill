import { pgTable, uuid, text, boolean, timestamp, integer, jsonb, date, numeric, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const ts = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};
const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);

export const tenants = pgTable('tenants', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  reportingCurrency: text('reporting_currency').notNull().default('INR'),
  companyMode: text('company_mode').notNull().default('small'), // small | large (diamond approvals)
  ...ts,
});

export const users = pgTable(
  'users',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    userKind: text('user_kind').notNull().default('system_user'),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull().default(''),
    email: text('email').notNull(),
    username: text('username'),
    mobile: text('mobile'),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('user'), // super_admin | admin | user
    avatarUrl: text('avatar_url'),
    contactVisibility: text('contact_visibility').notNull().default('all'),
    permissions: jsonb('permissions').$type<Record<string, string[]>>().notNull().default({}),
    firmIds: jsonb('firm_ids').$type<string[]>().notNull().default([]),
    branchIds: jsonb('branch_ids').$type<string[]>().notNull().default([]),
    statementFirmIds: jsonb('statement_firm_ids').$type<string[]>().notNull().default([]),
    statementBranchIds: jsonb('statement_branch_ids').$type<string[]>().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    customFields: jsonb('custom_fields').notNull().default({}),
    ...ts,
  },
  (t) => [uniqueIndex('users_tenant_email_idx').on(t.tenantId, t.email)],
);

export const refreshTokens = pgTable('refresh_tokens', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const firms = pgTable('firms', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  countryCode: text('country_code').notNull().default('IN'),
  gstTreatment: text('gst_treatment'),
  gstin: text('gstin'),
  website: text('website'),
  placeOfSupply: text('place_of_supply'),
  districtCode: text('district_code'),
  contactNumbers: jsonb('contact_numbers').$type<string[]>().notNull().default([]),
  emails: jsonb('emails').$type<string[]>().notNull().default([]),
  taxIds: jsonb('tax_ids').$type<{ label: string; value?: string | null; enabled: boolean }[]>().notNull().default([]),
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  state: text('state'),
  city: text('city'),
  area: text('area'),
  pincode: text('pincode'),
  googleMapUrl: text('google_map_url'),
  currency: text('currency').notNull().default('INR'),
  currencyFormat: text('currency_format').notNull().default('1,234,567.89'),
  amountInWordsFormat: text('amount_in_words_format').notNull().default('indian'),
  timeZone: text('time_zone').notNull().default('Asia/Kolkata'),
  dateFormat: text('date_format').notNull().default('dd-MM-yyyy'),
  timeFormat: text('time_format').notNull().default('hh:mm tt'),
  fiscalYear: text('fiscal_year').notNull().default('april-march'),
  logoUrl: text('logo_url'),
  regulatedBank: jsonb('regulated_bank').notNull().default({}),
  unregulatedBank: jsonb('unregulated_bank').notNull().default({}),
  ...ts,
});

export const branches = pgTable('branches', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  address: text('address'),
  isDefault: boolean('is_default').notNull().default(false),
  userIds: jsonb('user_ids').$type<string[]>().notNull().default([]),
  ...ts,
});

export const fiscalYears = pgTable('fiscal_years', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  ...ts,
});

export const currencies = pgTable(
  'currencies',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    symbol: text('symbol').notNull(),
    decimalPlaces: integer('decimal_places').notNull().default(2),
    isBaseCurrency: boolean('is_base_currency').notNull().default(false),
    exchangeRate: numeric('exchange_rate', { precision: 18, scale: 6 }).notNull().default('1'),
    isActive: boolean('is_active').notNull().default(true),
    ...ts,
  },
  (t) => [uniqueIndex('currencies_tenant_code_idx').on(t.tenantId, t.code)],
);

export const series = pgTable(
  'series',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    firmId: uuid('firm_id').notNull().references(() => firms.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    fiscalYearId: uuid('fiscal_year_id').notNull().references(() => fiscalYears.id, { onDelete: 'cascade' }),
    usedFor: text('used_for').notNull(),
    seriesType: text('series_type').notNull(), // regulated | unregulated
    seriesName: text('series_name').notNull(),
    prefix: text('prefix').notNull().default(''),
    postfix: text('postfix').notNull().default(''),
    paddingLength: integer('padding_length').notNull().default(1),
    nextNumber: integer('next_number').notNull().default(1),
    isDefault: boolean('is_default').notNull().default(false),
    ...ts,
  },
  (t) => [index('series_lookup_idx').on(t.tenantId, t.firmId, t.usedFor)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    firmId: uuid('firm_id').references(() => firms.id, { onDelete: 'cascade' }), // null = all firms
    parentId: uuid('parent_id'),
    code: text('code'),
    name: text('name').notNull(),
    accountType: text('account_type').notNull(), // asset | liability | equity | income | expense
    accountSubType: text('account_sub_type').notNull(),
    nature: text('nature').notNull(), // debit | credit
    description: text('description'),
    isGroup: boolean('is_group').notNull().default(false),
    isSystem: boolean('is_system').notNull().default(false),
    systemKey: text('system_key'), // e.g. accounts_receivable, sales, cogs
    isActive: boolean('is_active').notNull().default(true),
    bankName: text('bank_name'),
    accountNumber: text('account_number'),
    ifscCode: text('ifsc_code'),
    branchName: text('branch_name'),
    currencyCode: text('currency_code').notNull().default('INR'),
    displayOrder: integer('display_order').notNull().default(0),
    createdBy: uuid('created_by'),
    ...ts,
  },
  (t) => [index('accounts_tenant_idx').on(t.tenantId, t.accountType)],
);

export const firmSettings = pgTable('firm_settings', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }).unique(),
  settings: jsonb('settings').notNull().default({}),
  ...ts,
});

export const customFields = pgTable(
  'custom_fields',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    fieldName: text('field_name').notNull(),
    fieldLabel: text('field_label').notNull(),
    fieldType: text('field_type').notNull(),
    moduleNames: jsonb('module_names').$type<string[]>().notNull().default([]),
    serialNo: integer('serial_no'),
    fieldConfig: jsonb('field_config').notNull().default({}), // options, conditionalFields, diamondPropertyType, etc.
    isRequired: boolean('is_required').notNull().default(false),
    isReadOnly: boolean('is_read_only').notNull().default(false),
    isUnique: boolean('is_unique').notNull().default(false),
    tooltip: text('tooltip'),
    showTooltip: boolean('show_tooltip').notNull().default(false),
    defaultValue: jsonb('default_value'),
    usedInLabProcess: boolean('used_in_lab_process').notNull().default(false),
    useInRapaportAdditionalBack: boolean('use_in_rapaport_additional_back').notNull().default(false),
    displaySection: text('display_section'),
    displayOrder: integer('display_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...ts,
  },
  (t) => [uniqueIndex('custom_fields_tenant_name_idx').on(t.tenantId, t.fieldName)],
);

export const contacts = pgTable(
  'contacts',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    firmId: uuid('firm_id').references(() => firms.id, { onDelete: 'set null' }),
    branchId: uuid('branch_id'),
    contactType: text('contact_type').notNull().default('contact'),
    companyName: text('company_name').notNull(),
    contactName: text('contact_name').notNull().default(''),
    contactPerson: text('contact_person'),
    serialNo: integer('serial_no').notNull(),
    email: text('email'),
    phoneCode: text('phone_code').notNull().default('+91'),
    phone: text('phone'),
    whatsappNo: text('whatsapp_no'),
    isPhoneWhatsapp: boolean('is_phone_whatsapp').notNull().default(true),
    gstin: text('gstin'),
    gstTreatment: text('gst_treatment').notNull().default('unregistered'),
    panNo: text('pan_no'),
    billingAddress: jsonb('billing_address').notNull().default({}),
    shippingAddresses: jsonb('shipping_addresses').notNull().default([]),
    bankName: text('bank_name'),
    accountNo: text('account_no'),
    bankBranch: text('bank_branch'),
    ifscCode: text('ifsc_code'),
    swiftCode: text('swift_code'),
    contactPersons: jsonb('contact_persons').notNull().default([]),
    dob: date('dob'),
    salesPersonId: uuid('sales_person_id'),
    referenceContactId: uuid('reference_contact_id'),
    assignedTo: uuid('assigned_to'),
    discountType: text('discount_type').notNull().default('fixed'),
    discountValue: numeric('discount_value', { precision: 18, scale: 4 }),
    paymentTermDays: integer('payment_term_days'),
    paymentTermName: text('payment_term_name'),
    defaultTdsRateId: uuid('default_tds_rate_id'),
    defaultTcsRateId: uuid('default_tcs_rate_id'),
    brokerageValue: numeric('brokerage_value', { precision: 18, scale: 4 }),
    creditLimitAmount: numeric('credit_limit_amount', { precision: 18, scale: 2 }),
    creditLimitCurrencyCode: text('credit_limit_currency_code'),
    notes: text('notes'),
    portalAccess: boolean('portal_access').notNull().default(false),
    customFields: jsonb('custom_fields').notNull().default({}),
    attachments: jsonb('attachments').notNull().default([]),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
    ...ts,
  },
  (t) => [index('contacts_tenant_type_idx').on(t.tenantId, t.contactType), index('contacts_tenant_name_idx').on(t.tenantId, t.companyName)],
);

export const listPreferences = pgTable(
  'list_preferences',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    moduleName: text('module_name').notNull(),
    columns: jsonb('columns').$type<{ key: string; visible: boolean }[]>().notNull().default([]),
    filterGroups: jsonb('filter_groups').notNull().default([]),
    ...ts,
  },
  (t) => [uniqueIndex('list_pref_idx').on(t.userId, t.moduleName)],
);

export const activityLogs = pgTable(
  'activity_logs',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    action: text('action').notNull(), // created | updated | deleted | status_changed | ...
    description: text('description').notNull(),
    meta: jsonb('meta').notNull().default({}),
    userId: uuid('user_id'),
    userName: text('user_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('activity_entity_idx').on(t.entityType, t.entityId)],
);
