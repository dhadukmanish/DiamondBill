// Sidebar navigation tree — exact structure of the reference "Diamond Finance" module

export interface NavItem {
  label: string;
  href?: string;
  icon?: string; // lucide icon name
  permission?: string; // sub-module key required (read)
  children?: NavItem[];
}
export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Home', href: '/dashboard', icon: 'Home' },
      { label: 'Contacts', href: '/modules/crm/contacts', icon: 'Users', permission: 'crm_contacts' },
    ],
  },
  {
    title: 'Diamond',
    items: [{ label: 'Approvals', href: '/modules/diamond/approvals', icon: 'BadgeCheck', permission: 'jwel_dmfg_approvals' }],
  },
  {
    title: 'Accounting',
    items: [
      { label: 'Dashboard', href: '/modules/accounting', icon: 'LayoutDashboard', permission: 'acc_dashboard' },
      { label: 'Chart of Accounts', href: '/modules/accounting/masters/chart-of-accounts', icon: 'BookOpen', permission: 'acc_chart_of_accounts' },
      {
        label: 'Products & Inventory',
        icon: 'Package',
        children: [
          { label: 'Products', href: '/modules/accounting/products', permission: 'acc_products' },
          { label: 'Stock View', href: '/modules/accounting/inventory/stock-view', permission: 'acc_stock_view' },
          { label: 'Branch Wise Stock View', href: '/modules/accounting/inventory/branch-wise-stock-view', permission: 'acc_branch_wise_stock_view' },
          { label: 'Month Wise Stock Summary', href: '/modules/accounting/inventory/month-wise-stock-summary', permission: 'acc_month_wise_stock_summary' },
          { label: 'Stock Adjustment', href: '/modules/accounting/inventory/adjustment', permission: 'acc_stock_adjustment' },
          { label: 'Stock Tally', href: '/modules/accounting/inventory/stock-tally', permission: 'acc_stock_tally' },
          { label: 'Stock Transfer F/B', href: '/modules/accounting/inventory/transfer', permission: 'acc_stock_transfer' },
          { label: 'Product Transfer', href: '/modules/accounting/inventory/item-transfer', permission: 'acc_item_transfer' },
        ],
      },
      { label: 'Certified Products', href: '/modules/accounting/certified-products', icon: 'Gem', permission: 'acc_certified_stock' },
      {
        label: 'Product Process',
        icon: 'Workflow',
        children: [
          { label: 'Process', href: '/modules/accounting/product-process/processes', permission: 'acc_product_process' },
          { label: 'Issue / Return', href: '/modules/accounting/product-process/issue-return', permission: 'acc_product_process_issue' },
        ],
      },
      { label: 'Lab Issue / Return', href: '/modules/accounting/lab-process', icon: 'FlaskConical', permission: 'acc_lab_process' },
      {
        label: 'Purchase',
        icon: 'ShoppingCart',
        children: [
          { label: 'Purchase Memos', href: '/modules/accounting/purchase/orders', permission: 'acc_purchase_orders' },
          { label: 'Purchase Memo Returns', href: '/modules/accounting/purchase/po-returns', permission: 'acc_po_return' },
          { label: 'Purchase Bills', href: '/modules/accounting/purchase/bills', permission: 'acc_purchases' },
          { label: 'Debit Notes', href: '/modules/accounting/purchase/debit-notes', permission: 'acc_debit_notes' },
          { label: 'Vendor Payments', href: '/modules/accounting/purchase/vendor-payments', permission: 'acc_vendor_payments' },
        ],
      },
      {
        label: 'Sales',
        icon: 'Receipt',
        children: [
          { label: 'Sales Memos', href: '/modules/accounting/sales/orders', permission: 'acc_sales_orders' },
          { label: 'Sales Memo Returns', href: '/modules/accounting/sales/so-returns', permission: 'acc_so_return' },
          { label: 'Invoices', href: '/modules/accounting/sales/invoices', permission: 'acc_invoices' },
          { label: 'Credit Notes', href: '/modules/accounting/sales/credit-notes', permission: 'acc_credit_notes' },
          { label: 'Customer Payments', href: '/modules/accounting/sales/customer-payments', permission: 'acc_customer_payments' },
          { label: 'Packages', href: '/modules/accounting/sales/packages', permission: 'acc_packages' },
          { label: 'Shipments', href: '/modules/accounting/sales/shipments', permission: 'acc_shipments' },
        ],
      },
      {
        label: 'Transactions',
        icon: 'ArrowLeftRight',
        children: [
          { label: 'All Transactions', href: '/modules/accounting/transactions', permission: 'acc_transactions' },
          { label: 'Broker Payments', href: '/modules/accounting/brokerage/broker-payments', permission: 'acc_broker_payments' },
        ],
      },
      { label: 'Banking', href: '/modules/accounting/banking', icon: 'Landmark', permission: 'acc_banking' },
      { label: 'Reports', href: '/modules/accounting/reports', icon: 'BarChart3', permission: 'acc_reports' },
    ],
  },
];

export interface SettingsGroup {
  title: string;
  icon: string;
  items: { label: string; href: string; permission?: string }[];
}
export const SETTINGS_GROUPS: SettingsGroup[] = [
  { title: 'Subscription & Billing', icon: 'BadgeDollarSign', items: [{ label: 'Subscription', href: '/modules/settings/subscription' }] },
  {
    title: 'Organization',
    icon: 'Building2',
    items: [
      { label: 'Firm', href: '/modules/settings/firm', permission: 'admin_firms' },
      { label: 'Branch', href: '/modules/settings/branch', permission: 'admin_branches' },
      { label: 'Financial Year', href: '/modules/settings/fiscal-years', permission: 'admin_financial_year' },
      { label: 'Series', href: '/modules/settings/series', permission: 'crm_series' },
      { label: 'Contact', href: '/modules/settings/contact' },
      { label: 'Currencies', href: '/modules/settings/currencies', permission: 'admin_currencies' },
      { label: 'Storage', href: '/modules/settings/storage' },
    ],
  },
  {
    title: 'Users & Roles',
    icon: 'UserCog',
    items: [
      { label: 'Users', href: '/modules/settings/users', permission: 'admin_users' },
      { label: 'Notification Permissions', href: '/modules/settings/notification-permissions', permission: 'admin_notification_permissions' },
    ],
  },
  {
    title: 'Customization',
    icon: 'SlidersHorizontal',
    items: [
      { label: 'Custom Field', href: '/modules/settings/custom-fields', permission: 'crm_custom_fields' },
      { label: 'Email Template', href: '/modules/settings/email', permission: 'admin_email_template' },
      { label: 'WhatsApp', href: '/modules/settings/whatsapp', permission: 'admin_whatsapp' },
    ],
  },
  {
    title: 'Accounting Setup',
    icon: 'Calculator',
    items: [
      { label: 'General', href: '/modules/settings/general', permission: 'admin_general_settings' },
      { label: 'Opening Balance', href: '/modules/settings/opening-balance', permission: 'acc_opening_balance' },
      { label: 'Sales Persons', href: '/modules/settings/sales-persons', permission: 'acc_sales_persons' },
      { label: 'Custom Print', href: '/modules/settings/print', permission: 'acc_custom_print' },
      { label: 'Terms & Condition', href: '/modules/settings/terms-conditions', permission: 'acc_terms' },
      { label: 'Cheque Book', href: '/modules/settings/cheque-books', permission: 'acc_cheque_books' },
      { label: 'Carriers', href: '/modules/settings/carriers', permission: 'acc_carriers' },
      { label: 'Shipment Statuses', href: '/modules/settings/shipment-statuses', permission: 'acc_shipment_statuses' },
      { label: 'Payment Modes', href: '/modules/settings/payment-modes', permission: 'acc_banking' },
      { label: 'Payment Terms', href: '/modules/settings/payment-terms', permission: 'admin_general_settings' },
    ],
  },
  {
    title: 'Diamond Accounting Setting',
    icon: 'Gem',
    items: [
      { label: 'Lab', href: '/modules/settings/labs', permission: 'acc_labs' },
      { label: 'Rapaport Price', href: '/modules/settings/rapaport-prices', permission: 'acc_rapaport_prices' },
      { label: 'Rapaport Additional Back', href: '/modules/settings/rapaport-additional-back', permission: 'acc_rapaport_additional_back' },
      { label: 'Rapaport Custom Size', href: '/modules/settings/rapaport-custom-size', permission: 'acc_rapaport_custom_size' },
    ],
  },
  {
    title: 'Taxes & Compliance',
    icon: 'Scale',
    items: [
      { label: 'Taxes', href: '/modules/settings/taxes', permission: 'acc_taxes' },
      { label: 'TDS Settings', href: '/modules/settings/tds-settings', permission: 'acc_tds_settings' },
      { label: 'TCS Rates', href: '/modules/settings/tcs-rates', permission: 'acc_tcs_rates' },
      { label: 'E-Invoicing', href: '/modules/settings/e-invoicing', permission: 'acc_e_invoicing' },
    ],
  },
  {
    title: 'Inventory',
    icon: 'Boxes',
    items: [
      { label: 'Products', href: '/modules/settings/products' },
      { label: 'Opening Stock', href: '/modules/settings/opening-stock', permission: 'acc_opening_stock' },
      { label: 'Units', href: '/modules/settings/units', permission: 'acc_units' },
      { label: 'Category', href: '/modules/settings/product-categories', permission: 'acc_categories' },
      { label: 'Product Name Templates', href: '/modules/settings/product-name-templates' },
      { label: 'Price Lists', href: '/modules/settings/price-lists', permission: 'acc_price_lists' },
      { label: 'Stock API', href: '/modules/settings/stock-api', permission: 'acc_stock_api' },
      { label: 'Product Barcode Settings', href: '/modules/settings/product-barcode', permission: 'acc_product_barcode_settings' },
    ],
  },
  {
    title: 'Storefront',
    icon: 'Store',
    items: [
      { label: 'Public Shop', href: '/modules/settings/shop' },
      { label: 'Domains', href: '/modules/settings/shop/domains' },
    ],
  },
];
