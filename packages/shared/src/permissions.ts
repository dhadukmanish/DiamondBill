// Permission sub-module keys (mirrors the reference system's 79 keys, grouped by product module)

export type PermissionAction = 'read' | 'create' | 'update' | 'delete';
export const PERMISSION_ACTIONS: PermissionAction[] = ['read', 'create', 'update', 'delete'];

export interface PermissionDef {
  name: string;
  displayName: string;
  module: 'crm' | 'admin' | 'accounting' | 'diamond';
  actions?: PermissionAction[]; // default all four
  hint?: string;
}

export const PERMISSIONS: PermissionDef[] = [
  // Organization / admin
  { name: 'admin_firms', displayName: 'Firms', module: 'admin' },
  { name: 'admin_branches', displayName: 'Branches', module: 'admin' },
  { name: 'admin_users', displayName: 'Users', module: 'admin' },
  { name: 'admin_view_all_user_entry', displayName: 'View All User Entry', module: 'admin' },
  { name: 'admin_view_all_user_entry_team', displayName: 'View All User Entry (Team-wise)', module: 'admin' },
  { name: 'admin_financial_year', displayName: 'Financial Year', module: 'admin' },
  { name: 'crm_series', displayName: 'Series', module: 'crm' },
  { name: 'crm_custom_fields', displayName: 'Custom Fields', module: 'crm' },
  { name: 'admin_email_template', displayName: 'Email Template', module: 'admin' },
  { name: 'admin_currencies', displayName: 'Currencies', module: 'admin' },
  { name: 'crm_contacts', displayName: 'Contacts', module: 'crm' },
  { name: 'crm_contacts_hierarchy', displayName: 'Display Contact Hierarchy', module: 'crm', actions: ['read'], hint: "Show this user's own contacts plus contacts of every subordinate user" },
  { name: 'admin_notification_permissions', displayName: 'Notification Permissions', module: 'admin' },
  { name: 'admin_general_settings', displayName: 'General Settings', module: 'admin' },
  { name: 'admin_whatsapp', displayName: 'WhatsApp', module: 'admin' },
  // Accounting
  { name: 'acc_dashboard', displayName: 'Dashboard', module: 'accounting' },
  { name: 'acc_chart_of_accounts', displayName: 'Chart of Accounts', module: 'accounting' },
  { name: 'acc_opening_balance', displayName: 'Opening Balance', module: 'accounting' },
  { name: 'acc_sales_persons', displayName: 'Sales Persons', module: 'accounting' },
  { name: 'acc_terms', displayName: 'Terms & Conditions', module: 'accounting' },
  { name: 'acc_taxes', displayName: 'Tax Groups', module: 'accounting' },
  { name: 'acc_tds_settings', displayName: 'TDS Settings', module: 'accounting' },
  { name: 'acc_tcs_rates', displayName: 'TCS Rates', module: 'accounting' },
  { name: 'acc_e_invoicing', displayName: 'E-Invoicing', module: 'accounting' },
  { name: 'acc_custom_print', displayName: 'Custom Print', module: 'accounting', hint: 'HTML Print Templates: Allow building HTML print templates' },
  { name: 'acc_opening_stock', displayName: 'Opening Stock', module: 'accounting' },
  { name: 'acc_sales_loose_stock', displayName: 'Loose Products Sales', module: 'accounting', hint: 'Allow adding Loose Diamond products on sales documents' },
  { name: 'acc_sales_certified_stock', displayName: 'Certified Products Sales', module: 'accounting', hint: 'Allow adding Certified products on sales documents' },
  { name: 'acc_sales_general_stock', displayName: 'Sales - General Products', module: 'accounting', actions: ['read'] },
  { name: 'acc_units', displayName: 'Units', module: 'accounting' },
  { name: 'acc_categories', displayName: 'Categories', module: 'accounting' },
  { name: 'acc_stock_view', displayName: 'Stock View', module: 'accounting' },
  { name: 'acc_branch_wise_stock_view', displayName: 'Branch Wise Stock View', module: 'accounting' },
  { name: 'acc_stock_adjustment', displayName: 'Stock Adjustment', module: 'accounting' },
  { name: 'acc_stock_transfer', displayName: 'Stock Transfer', module: 'accounting' },
  { name: 'acc_item_transfer', displayName: 'Product Transfer', module: 'accounting' },
  { name: 'acc_purchase_orders', displayName: 'Purchase Orders', module: 'accounting' },
  { name: 'acc_po_return', displayName: 'PO Return', module: 'accounting' },
  { name: 'acc_purchases', displayName: 'Purchase Bills', module: 'accounting' },
  { name: 'acc_debit_notes', displayName: 'Debit Notes', module: 'accounting' },
  { name: 'acc_vendor_payments', displayName: 'Vendor Payments', module: 'accounting' },
  { name: 'acc_sales_orders', displayName: 'Sales Orders', module: 'accounting' },
  { name: 'acc_so_return', displayName: 'SO Return', module: 'accounting' },
  { name: 'acc_invoices', displayName: 'Invoices', module: 'accounting' },
  { name: 'acc_credit_notes', displayName: 'Credit Notes', module: 'accounting' },
  { name: 'acc_customer_payments', displayName: 'Customer Payments', module: 'accounting' },
  { name: 'acc_broker_payments', displayName: 'Broker Payments', module: 'accounting' },
  { name: 'acc_transactions', displayName: 'Transactions', module: 'accounting' },
  { name: 'acc_banking', displayName: 'Banking', module: 'accounting' },
  { name: 'acc_bank_statements', displayName: 'Bank Statements', module: 'accounting' },
  { name: 'acc_product_barcode_settings', displayName: 'Product Barcode Settings', module: 'accounting' },
  { name: 'acc_reports', displayName: 'Reports', module: 'accounting' },
  { name: 'acc_labs', displayName: 'Account Lab', module: 'accounting' },
  { name: 'acc_lab_process', displayName: 'Account Lab Process', module: 'accounting' },
  { name: 'acc_stock_api', displayName: 'Stock API', module: 'accounting' },
  { name: 'acc_price_lists', displayName: 'Price Lists', module: 'accounting' },
  { name: 'acc_month_wise_stock_summary', displayName: 'Month Wise Stock Summary', module: 'accounting' },
  { name: 'acc_rapaport_prices', displayName: 'Rapaport Price', module: 'accounting' },
  { name: 'acc_rapaport_additional_back', displayName: 'Rapaport Additional Back', module: 'accounting' },
  { name: 'acc_rapaport_custom_size', displayName: 'Rapaport Custom Size', module: 'accounting' },
  { name: 'acc_cheque_books', displayName: 'Cheque Book', module: 'accounting' },
  { name: 'acc_tax_reports', displayName: 'Tax Reports', module: 'accounting' },
  { name: 'acc_cheque_leaves', displayName: 'Cheque Leaf', module: 'accounting' },
  { name: 'acc_stock_tally', displayName: 'Stock Tally', module: 'accounting' },
  { name: 'acc_expense_links', displayName: 'Link Expense to Purchase & Invoice', module: 'accounting' },
  { name: 'acc_packages', displayName: 'Packages', module: 'accounting' },
  { name: 'acc_shipments', displayName: 'Shipments', module: 'accounting' },
  { name: 'acc_carriers', displayName: 'Carriers', module: 'accounting' },
  { name: 'acc_shipment_statuses', displayName: 'Shipment Statuses', module: 'accounting' },
  { name: 'acc_product_process', displayName: 'Product Process', module: 'accounting' },
  { name: 'acc_product_process_issue', displayName: 'Product Process Issue/Return', module: 'accounting' },
  { name: 'acc_certified_stock', displayName: 'Certified Products', module: 'accounting' },
  { name: 'acc_loose_diamond_stock', displayName: 'Loose Products', module: 'accounting' },
  { name: 'acc_products', displayName: 'Products', module: 'accounting' },
  // Diamond
  { name: 'jwel_dmfg_approvals', displayName: 'Diamond Approvals', module: 'diamond' },
  { name: 'jwel_dmfg_lot_process_delete', displayName: 'Diamond Lot Process Delete', module: 'diamond' },
];

export const PERMISSION_MODULE_LABELS: Record<PermissionDef['module'], string> = {
  admin: 'Organization',
  crm: 'Organization',
  accounting: 'Accounting',
  diamond: 'Diamond',
};

/** A permission grant map: { [subModule]: PermissionAction[] } */
export type PermissionGrants = Record<string, PermissionAction[]>;

export function allPermissions(): PermissionGrants {
  const g: PermissionGrants = {};
  for (const p of PERMISSIONS) g[p.name] = p.actions ?? [...PERMISSION_ACTIONS];
  return g;
}
