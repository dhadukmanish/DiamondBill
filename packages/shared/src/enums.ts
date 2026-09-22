// Domain enumerations (mirrors the reference system's value sets)

export const CONTACT_TYPES = ['customer', 'vendor', 'customer_vendor', 'broker', 'contact'] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];
export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  customer: 'Customer',
  vendor: 'Vendor',
  customer_vendor: 'Customer & Vendor',
  broker: 'Broker',
  contact: 'Contact Only',
};

export const SERIES_USED_FOR = [
  'sales_order',
  'sales_order_return',
  'invoice',
  'package',
  'shipment',
  'credit_note',
  'customer_payment',
  'purchase_order',
  'purchase_order_return',
  'purchase_bill',
  'debit_note',
  'vendor_payment',
  'broker_payment',
  'adjustment',
  'stock_transfer',
  'item_transfer',
  'transaction',
] as const;
export type SeriesUsedFor = (typeof SERIES_USED_FOR)[number];
export const SERIES_USED_FOR_LABELS: Record<SeriesUsedFor, string> = {
  sales_order: 'Sales Memo',
  sales_order_return: 'Sales Memo Return',
  invoice: 'Invoice',
  package: 'Package',
  shipment: 'Shipment',
  credit_note: 'Credit Note',
  customer_payment: 'Customer Payment',
  purchase_order: 'Purchase Memo',
  purchase_order_return: 'Purchase Memo Return',
  purchase_bill: 'Purchase Bill',
  debit_note: 'Debit Note',
  vendor_payment: 'Vendor Payment',
  broker_payment: 'Broker Payment',
  adjustment: 'Adjustment',
  stock_transfer: 'Stock Transfer F/B',
  item_transfer: 'Product Transfer',
  transaction: 'Transaction',
};
/** Default prefix codes used by "Add Multiple" auto-fill: <CODE>P- (regulated) / <CODE>K- (unregulated) */
export const SERIES_DEFAULT_CODES: Record<SeriesUsedFor, string> = {
  sales_order: 'SO',
  sales_order_return: 'SOR',
  invoice: 'I',
  package: '',
  shipment: '',
  credit_note: 'CN',
  customer_payment: 'CP',
  purchase_order: 'PO',
  purchase_order_return: 'POR',
  purchase_bill: 'P',
  debit_note: 'DN',
  vendor_payment: 'VP',
  broker_payment: 'BP',
  adjustment: 'A',
  stock_transfer: 'ST',
  item_transfer: 'IT',
  transaction: 'T',
};

export const SERIES_TYPES = ['regulated', 'unregulated'] as const;
export type SeriesType = (typeof SERIES_TYPES)[number];

export const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  income: 'Income',
  expense: 'Expenses',
};
export const ACCOUNT_SUB_TYPES: Record<AccountType, { value: string; label: string }[]> = {
  asset: [
    { value: 'other_asset', label: 'Other Asset' },
    { value: 'other_current_asset', label: 'Other Current Asset' },
    { value: 'cash', label: 'Cash' },
    { value: 'bank', label: 'Bank' },
    { value: 'fixed_asset', label: 'Fixed Asset' },
    { value: 'accounts_receivable', label: 'Accounts Receivable' },
    { value: 'stock', label: 'Stock' },
    { value: 'payment_clearing', label: 'Payment Clearing Account' },
    { value: 'intangible_asset', label: 'Intangible Asset' },
    { value: 'non_current_asset', label: 'Non Current Asset' },
    { value: 'deferred_tax_asset', label: 'Deferred Tax Asset' },
  ],
  liability: [
    { value: 'accounts_payable', label: 'Accounts Payable' },
    { value: 'other_current_liability', label: 'Other Current Liability' },
    { value: 'credit_card', label: 'Credit Card' },
    { value: 'long_term_liability', label: 'Long Term Liability' },
    { value: 'other_liability', label: 'Other Liability' },
  ],
  equity: [{ value: 'equity', label: 'Equity' }],
  income: [
    { value: 'income', label: 'Income' },
    { value: 'other_income', label: 'Other Income' },
  ],
  expense: [
    { value: 'expense', label: 'Expense' },
    { value: 'cost_of_goods_sold', label: 'Cost of Goods Sold' },
    { value: 'other_expense', label: 'Other Expense' },
  ],
};
export const ACCOUNT_NATURE_BY_TYPE: Record<AccountType, 'debit' | 'credit'> = {
  asset: 'debit',
  expense: 'debit',
  liability: 'credit',
  equity: 'credit',
  income: 'credit',
};

export const CUSTOM_FIELD_TYPES = [
  'single_line',
  'multi_line',
  'password',
  'email',
  'phone',
  'url',
  'picklist',
  'multi_select',
  'checkbox',
  'date',
  'datetime',
  'number',
  'auto_number',
  'currency',
  'decimal',
  'percent',
  'long_integer',
  'lookup',
  'multi_lookup',
  'formula',
  'calculation',
  'rollup',
  'user',
  'file',
  'image',
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];
export const CUSTOM_FIELD_TYPE_GROUPS: { group: string; types: { type: CustomFieldType; label: string; desc: string }[] }[] = [
  {
    group: 'TEXT',
    types: [
      { type: 'single_line', label: 'Single Line', desc: 'Short text up to 255 characters' },
      { type: 'multi_line', label: 'Multi Line', desc: 'Long-form paragraph text' },
      { type: 'password', label: 'Password', desc: 'Masked value, shown as ••••' },
      { type: 'email', label: 'Email', desc: 'Validated email address' },
      { type: 'phone', label: 'Phone', desc: 'International phone number' },
      { type: 'url', label: 'URL', desc: 'Clickable web link' },
    ],
  },
  {
    group: 'CHOICE',
    types: [
      { type: 'picklist', label: 'Pick List', desc: 'Single choice from a dropdown' },
      { type: 'multi_select', label: 'Multi Select', desc: 'Choose multiple options' },
      { type: 'checkbox', label: 'Checkbox', desc: 'Yes / No toggle' },
    ],
  },
  {
    group: 'DATE & TIME',
    types: [
      { type: 'date', label: 'Date', desc: 'Calendar date picker' },
      { type: 'datetime', label: 'Date / Time', desc: 'Date with time of day' },
    ],
  },
  {
    group: 'NUMBER',
    types: [
      { type: 'number', label: 'Number', desc: 'Whole numeric value' },
      { type: 'auto_number', label: 'Auto Number', desc: 'Auto-incrementing identifier' },
      { type: 'currency', label: 'Currency', desc: 'Money with currency symbol' },
      { type: 'decimal', label: 'Decimal', desc: 'Number with decimal precision' },
      { type: 'percent', label: 'Percent', desc: 'Percentage value (0-100%)' },
      { type: 'long_integer', label: 'Long Integer', desc: 'Large whole number' },
    ],
  },
  {
    group: 'ADVANCED',
    types: [
      { type: 'lookup', label: 'Lookup', desc: 'Reference a record from another module' },
      { type: 'multi_lookup', label: 'Multi Lookup', desc: 'Reference multiple records' },
      { type: 'formula', label: 'Formula', desc: 'Compute a value from other fields' },
      { type: 'calculation', label: 'Calculation', desc: 'Arithmetic calculation between numeric fields' },
      { type: 'rollup', label: 'Rollup Summary', desc: 'Aggregate values across related records' },
      { type: 'user', label: 'User', desc: 'Pick a user from your team' },
    ],
  },
  {
    group: 'MEDIA',
    types: [
      { type: 'file', label: 'File Upload', desc: 'Attach documents or files' },
      { type: 'image', label: 'Image Upload', desc: 'Upload an image attachment' },
    ],
  },
];

/** Modules that can carry custom fields */
export const CUSTOM_FIELD_MODULES: { name: string; label: string }[] = [
  { name: 'crm_contacts', label: 'Contacts' },
  { name: 'sales_orders', label: 'Sales Memos' },
  { name: 'so_items', label: 'Sales Memo Items' },
  { name: 'invoices', label: 'Invoices' },
  { name: 'invoice_items', label: 'Invoice Items' },
  { name: 'packages', label: 'Packages' },
  { name: 'shipments', label: 'Shipments' },
  { name: 'purchases', label: 'Purchase Bills' },
  { name: 'purchase_items', label: 'Purchase Bill Items' },
  { name: 'purchase_orders', label: 'Purchase Memos' },
  { name: 'po_items', label: 'Purchase Memo Items' },
  { name: 'credit_notes', label: 'Credit Notes' },
  { name: 'credit_note_items', label: 'Credit Note Items' },
  { name: 'debit_notes', label: 'Debit Notes' },
  { name: 'debit_note_items', label: 'Debit Note Items' },
  { name: 'customer_payment', label: 'Customer Payment' },
  { name: 'vendor_payment', label: 'Vendor Payment' },
  { name: 'stock_transfer', label: 'Stock Transfer F/B' },
  { name: 'stock_transfer_items', label: 'Stock Transfer F/B Items' },
  { name: 'products', label: 'Products' },
  { name: 'product_items', label: 'Product Items' },
  { name: 'certified_products', label: 'Certified products' },
  { name: 'product_process', label: 'Product process' },
  { name: 'transactions', label: 'Transactions' },
  { name: 'users', label: 'Users' },
];

/** Diamond property types with codes (mirrors reference codes) */
export const DIAMOND_PROPERTY_TYPES: { code: string; label: string; key: string; fieldType: CustomFieldType; required?: boolean; options?: string[] }[] = [
  { code: '1', key: 'shape', label: 'Shape', fieldType: 'picklist', required: true, options: ['Round', 'Princess', 'Oval', 'Marquise', 'Pear', 'Cushion', 'Emerald', 'Asscher', 'Radiant', 'Heart'] },
  { code: '2', key: 'repo_rate_size', label: 'Repo Rate Size', fieldType: 'picklist', options: ['0.01-0.03', '0.04-0.07', '0.08-0.14', '0.15-0.17', '0.18-0.22', '0.23-0.29', '0.30-0.39', '0.40-0.49', '0.50-0.69', '0.70-0.89', '0.90-0.99', '1.00-1.49', '1.50-1.99', '2.00-2.99', '3.00-3.99', '4.00-4.99', '5.00-5.99'] },
  { code: '5', key: 'clarity', label: 'Clarity', fieldType: 'picklist', required: true, options: ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'SI3', 'I1', 'I2', 'I3'] },
  { code: '6', key: 'color', label: 'Color', fieldType: 'picklist', required: true, options: 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('') },
  { code: '7', key: 'cut', label: 'Cut', fieldType: 'picklist', required: true, options: ['Excellent', 'Good', 'Fair', 'Poor', 'Ideal'] },
  { code: '8', key: 'polish', label: 'Polish', fieldType: 'picklist', required: true, options: ['Excellent', 'Good', 'Fair', 'Poor'] },
  { code: '9', key: 'symmetry', label: 'Symmetry', fieldType: 'picklist', required: true, options: ['Excellent', 'Good', 'Fair', 'Poor'] },
  { code: '10', key: 'fluorescence', label: 'Fluorescence', fieldType: 'single_line' },
  { code: '11', key: 'table_white_inclusion', label: 'Table White Inclusion', fieldType: 'single_line' },
  { code: '12', key: 'side_white_inclusion', label: 'Side White Inclusion', fieldType: 'single_line' },
  { code: '13', key: 'table_black_inclusion', label: 'Table Black Inclusion', fieldType: 'single_line' },
  { code: '14', key: 'side_black_inclusion', label: 'Side Black Inclusion', fieldType: 'single_line' },
  { code: '15', key: 'table_open', label: 'Table Open', fieldType: 'single_line' },
  { code: '16', key: 'side_open', label: 'Side Open', fieldType: 'single_line' },
  { code: '17', key: 'ting', label: 'Ting', fieldType: 'single_line' },
  { code: '41', key: 'certificate_no', label: 'Certificate No', fieldType: 'single_line', required: true },
  { code: '1001', key: 'stock_number', label: 'Stock Number', fieldType: 'single_line', required: true },
  { code: '1002', key: 'cut_grade', label: 'Cut Grade', fieldType: 'single_line' },
  { code: '1003', key: 'fluorescence_intensity', label: 'Fluorescence Intensity', fieldType: 'picklist', required: true, options: ['None', 'Faint', 'Medium', 'Strong', 'Very Strong'] },
  { code: '1004', key: 'fluorescence_color', label: 'Fluorescence Color', fieldType: 'single_line' },
  { code: '1005', key: 'measurement', label: 'Measurement', fieldType: 'single_line', required: true },
  { code: '1006', key: 'bgm', label: 'BGM', fieldType: 'single_line' },
  { code: '1007', key: 'eye_clean', label: 'Eye Clean', fieldType: 'single_line' },
  { code: '1009', key: 'raplab_report_id', label: 'RapLab Report ID', fieldType: 'single_line' },
  { code: '1010', key: 'treatment', label: 'Treatment', fieldType: 'single_line' },
  { code: '1011', key: 'depth_percent', label: 'Depth %', fieldType: 'decimal', required: true },
  { code: '1012', key: 'table_percent', label: 'Table %', fieldType: 'decimal', required: true },
  { code: '1013', key: 'girdle_thin', label: 'Girdle Thin', fieldType: 'single_line' },
  { code: '1014', key: 'girdle_thick', label: 'Girdle Thick', fieldType: 'single_line' },
  { code: '1015', key: 'girdle_percent', label: 'Girdle %', fieldType: 'decimal' },
  { code: '1016', key: 'girdle_condition', label: 'Girdle Condition', fieldType: 'single_line' },
  { code: '1017', key: 'culet_size', label: 'Culet Size', fieldType: 'single_line' },
  { code: '1018', key: 'culet_condition', label: 'Culet Condition', fieldType: 'single_line' },
  { code: '1019', key: 'crown_height', label: 'Crown Height', fieldType: 'decimal' },
  { code: '1020', key: 'crown_angle', label: 'Crown Angle', fieldType: 'decimal' },
  { code: '1021', key: 'pavilion_depth', label: 'Pavilion Depth', fieldType: 'decimal' },
  { code: '1022', key: 'pavilion_angle', label: 'Pavilion Angle', fieldType: 'decimal' },
  { code: '1023', key: 'laser_inscription', label: 'Laser Inscription', fieldType: 'single_line' },
  { code: '1024', key: 'cert_comment', label: 'Cert Comment', fieldType: 'single_line' },
  { code: '1025', key: 'key_to_symbol', label: 'Key to Symbol', fieldType: 'single_line' },
  { code: '1026', key: 'shade', label: 'Shade', fieldType: 'single_line' },
  { code: '1027', key: 'white_inclusion', label: 'White Inclusion', fieldType: 'single_line' },
  { code: '1028', key: 'black_inclusion', label: 'Black Inclusion', fieldType: 'single_line' },
  { code: '1029', key: 'open_inclusion', label: 'Open Inclusion', fieldType: 'single_line' },
  { code: '1030', key: 'milky', label: 'Milky', fieldType: 'single_line' },
  { code: '1031', key: 'fancy_color', label: 'Fancy Color', fieldType: 'single_line' },
  { code: '1032', key: 'fancy_color_intensity', label: 'Fancy Color Intensity', fieldType: 'single_line' },
  { code: '1033', key: 'fancy_color_overtone', label: 'Fancy Color Overtone', fieldType: 'single_line' },
  { code: '1034', key: 'country', label: 'Country', fieldType: 'single_line' },
  { code: '1035', key: 'state', label: 'State', fieldType: 'single_line' },
  { code: '1036', key: 'city', label: 'City', fieldType: 'single_line' },
  { code: '1037', key: 'brand', label: 'Brand', fieldType: 'single_line' },
  { code: '1038', key: 'website_link', label: 'Website Link', fieldType: 'url' },
  { code: '1039', key: 'image_link', label: 'Image Link', fieldType: 'url' },
  { code: '1040', key: 'video_link', label: 'Video Link', fieldType: 'url' },
  { code: '1041', key: 'certificate_link', label: 'Certificate Link', fieldType: 'url' },
  { code: '1043', key: 'measurements_depth', label: 'Measurements Depth', fieldType: 'decimal' },
  { code: '1044', key: 'measurements_length', label: 'Measurements Length', fieldType: 'decimal' },
  { code: '1045', key: 'measurements_width', label: 'Measurements Width', fieldType: 'decimal' },
  { code: '1046', key: 'growth_type', label: 'Growth Type', fieldType: 'picklist', required: true, options: ['Natural', 'CVD', 'HPHT'] },
  { code: '1047', key: 'ratio', label: 'Ratio', fieldType: 'decimal' },
  { code: '1048', key: 'h_and_a', label: 'H&A', fieldType: 'single_line' },
  { code: '1049', key: 'location', label: 'Location', fieldType: 'picklist', required: true, options: [] },
  { code: '1050', key: 'type', label: 'Type', fieldType: 'single_line' },
  { code: '1051', key: 'member_comments', label: 'Member Comments', fieldType: 'single_line' },
  { code: '1052', key: 'pair', label: 'Pair', fieldType: 'single_line' },
  { code: '1053', key: 'stock_number_for_matching_pair', label: 'Stock Number for Matching Pair', fieldType: 'single_line' },
  { code: '1054', key: 'share_access', label: 'Share Access', fieldType: 'single_line' },
  { code: '1055', key: 'featured', label: 'Featured', fieldType: 'single_line' },
  { code: '1056', key: 'crown_open', label: 'Crown Open', fieldType: 'single_line' },
  { code: '1057', key: 'girdle_open', label: 'Girdle Open', fieldType: 'single_line' },
  { code: '1058', key: 'star_length', label: 'Star Length', fieldType: 'single_line' },
  { code: '1059', key: 'luster', label: 'Luster', fieldType: 'single_line' },
  { code: '1060', key: 'location_of_black', label: 'Location of Black', fieldType: 'single_line' },
  { code: '1061', key: 'surface_graining', label: 'Surface Graining', fieldType: 'single_line' },
  { code: '1062', key: 'internal_graining', label: 'Internal Graining', fieldType: 'single_line' },
  { code: '1063', key: 'inclusion_pattern', label: 'Inclusion Pattern', fieldType: 'single_line' },
  { code: '1064', key: 'diamond_origin_report', label: 'Diamond Origin Report', fieldType: 'single_line' },
  { code: '1065', key: 'short_title', label: 'Short Title', fieldType: 'single_line' },
  { code: '1066', key: 'tags', label: 'Tags', fieldType: 'single_line' },
];

export const PRODUCT_STOCK_TYPES = ['general', 'loose_diamond', 'certified', 'metal', 'stone', 'jewellery'] as const;
export type ProductStockType = (typeof PRODUCT_STOCK_TYPES)[number];
export const STOCK_STATUSES = ['available', 'stock_out', 'temporary_stock_out', 'disable'] as const;
export const STOCK_STATUS_LABELS: Record<(typeof STOCK_STATUSES)[number], string> = {
  available: 'In Available',
  stock_out: 'Stock Out',
  temporary_stock_out: 'Temporary Stock Out',
  disable: 'Disable',
};

export const DOC_STATUSES = ['draft', 'open', 'partially_paid', 'paid', 'cancelled', 'closed', 'converted'] as const;
export const PAYMENT_TYPES = ['payment', 'note_payment', 'advance', 'refund'] as const;
export const TRANSACTION_TYPES = ['income', 'expense', 'transfer', 'expense_refund', 'monthly_employee_salary'] as const;
export const TAX_TYPES = ['gst', 'vat', 'sales tax', 'service tax', 'custom', 'out_of_scope'] as const;
export const GST_CATEGORIES = ['intra_state', 'inter_state'] as const;
export const LAB_TYPES = ['gia', 'igi', 'hrd', 'idl', 'egl', 'other'] as const;
export const PROCESS_BEHAVIORS = ['general', 'lab', 'pricing'] as const;
export const PROCESS_RETURN_STATUSES = ['available', 'keep_in_process'] as const;
export const PAYMENT_MODES_DEFAULT = ['Bank Transfer', 'Cash', 'Credit Card', 'Debit Card', 'Others', 'UPI'] as const;
export const USER_ROLES = ['super_admin', 'admin', 'user'] as const;
