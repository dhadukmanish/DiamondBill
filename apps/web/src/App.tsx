import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { Toaster } from '@/lib/toast';
import { Spinner } from '@/components/ui';
import AppShell from '@/components/layout/AppShell';
import Login from '@/pages/auth/Login';
import { ComingSoon, Dashboard, NotFound } from '@/pages/misc';

const SettingsLayout = lazy(() => import('@/pages/settings/SettingsLayout'));
const SettingsHub = lazy(() => import('@/pages/settings/SettingsLayout').then((m) => ({ default: m.SettingsHub })));
const FirmPage = lazy(() => import('@/pages/settings/FirmPage'));
const BranchPage = lazy(() => import('@/pages/settings/OrgPages').then((m) => ({ default: m.BranchPage })));
const FiscalYearPage = lazy(() => import('@/pages/settings/OrgPages').then((m) => ({ default: m.FiscalYearPage })));
const CurrenciesPage = lazy(() => import('@/pages/settings/OrgPages').then((m) => ({ default: m.CurrenciesPage })));
const SeriesPage = lazy(() => import('@/pages/settings/SeriesPage'));
const UsersPage = lazy(() => import('@/pages/settings/UsersPage'));
const CustomFieldsPage = lazy(() => import('@/pages/settings/CustomFieldsPage'));
const GeneralSettingsPage = lazy(() => import('@/pages/settings/GeneralSettingsPage'));
const ChartOfAccounts = lazy(() => import('@/pages/accounting/ChartOfAccounts'));
const ContactsPage = lazy(() => import('@/pages/crm/ContactsPage'));
const ProductsPage = lazy(() => import('@/pages/inventory/ProductsPage'));
const CertifiedProductsPage = lazy(() => import('@/pages/inventory/CertifiedProductsPage'));
const OpeningStockPage = lazy(() => import('@/pages/inventory/OpeningStockPage'));
const BarcodeSettingsPage = lazy(() => import('@/pages/inventory/BarcodeSettingsPage'));
const SP = (name: string) => lazy(() => import('@/pages/inventory/StockPages').then((m: any) => ({ default: m[name] })));
const SD = (name: string) => lazy(() => import('@/pages/inventory/StockDocsPages').then((m: any) => ({ default: m[name] })));
const RP = (name: string) => lazy(() => import('@/pages/inventory/RapaportPages').then((m: any) => ({ default: m[name] })));
const StockViewPage = SP('StockViewPage'), BranchWiseStockPage = SP('BranchWiseStockPage'), MonthWiseSummaryPage = SP('MonthWiseSummaryPage'), StockTallyPage = SP('StockTallyPage');
const StockAdjustmentsPage = SD('StockAdjustmentsPage'), StockTransfersPage = SD('StockTransfersPage'), ItemTransfersPage = SD('ItemTransfersPage');
const RapaportPricePage = RP('RapaportPricePage'), RapaportAdditionalBackPage = RP('RapaportAdditionalBackPage'), RapaportCustomSizePage = RP('RapaportCustomSizePage');
const MP = (name: string) => lazy(() => import('@/pages/settings/MasterPages').then((m: any) => ({ default: m[name] })));
const TaxesPage = MP('TaxesPage'), TdsPage = MP('TdsPage'), TcsPage = MP('TcsPage'), UnitsPage = MP('UnitsPage'), CategoriesPage = MP('CategoriesPage'), LabsPage = MP('LabsPage'), SalesPersonsPage = MP('SalesPersonsPage'), TermsPage = MP('TermsPage'), ChequeBooksPage = MP('ChequeBooksPage'), CarriersPage = MP('CarriersPage'), ShipmentStatusesPage = MP('ShipmentStatusesPage'), ProcessesPage = MP('ProcessesPage'), PriceListsPage = MP('PriceListsPage'), ProductNameTemplatesPage = MP('ProductNameTemplatesPage'), PaymentModesPage = MP('PaymentModesPage'), PaymentTermsPage = MP('PaymentTermsPage');

function Protected() {
  const token = useAuthStore((s) => s.accessToken);
  const loc = useLocation();
  if (!token) return <Navigate to={`/signin?callbackUrl=${encodeURIComponent(loc.pathname)}`} replace />;
  return <Outlet />;
}

const Fallback = () => <div className="flex justify-center py-20"><Spinner className="h-6 w-6 text-primary" /></div>;

export default function App() {
  return (
    <>
      <Toaster />
      <Suspense fallback={<Fallback />}>
        <Routes>
          <Route path="/signin" element={<Login />} />
          <Route element={<Protected />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/modules/crm/contacts" element={<ContactsPage />} />
              <Route path="/modules/accounting/masters/chart-of-accounts" element={<ChartOfAccounts />} />
              <Route path="/modules/accounting/product-process/processes" element={<ProcessesPage />} />
              <Route path="/modules/accounting/products" element={<ProductsPage />} />
              <Route path="/modules/accounting/certified-products" element={<CertifiedProductsPage />} />
              <Route path="/modules/accounting/inventory/stock-view" element={<StockViewPage />} />
              <Route path="/modules/accounting/inventory/branch-wise-stock-view" element={<BranchWiseStockPage />} />
              <Route path="/modules/accounting/inventory/month-wise-stock-summary" element={<MonthWiseSummaryPage />} />
              <Route path="/modules/accounting/inventory/adjustment" element={<StockAdjustmentsPage />} />
              <Route path="/modules/accounting/inventory/stock-tally" element={<StockTallyPage />} />
              <Route path="/modules/accounting/inventory/transfer" element={<StockTransfersPage />} />
              <Route path="/modules/accounting/inventory/item-transfer" element={<ItemTransfersPage />} />
              <Route path="/modules/accounting/*" element={<ComingSoon />} />
              <Route path="/modules/diamond/*" element={<ComingSoon />} />
              <Route path="/modules/settings" element={<SettingsHub />} />
              <Route path="/modules/settings" element={<SettingsLayout />}>
                <Route path="firm" element={<FirmPage />} />
                <Route path="branch" element={<BranchPage />} />
                <Route path="fiscal-years" element={<FiscalYearPage />} />
                <Route path="series" element={<SeriesPage />} />
                <Route path="currencies" element={<CurrenciesPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="custom-fields" element={<CustomFieldsPage />} />
                <Route path="general" element={<GeneralSettingsPage />} />
                <Route path="taxes" element={<TaxesPage />} />
                <Route path="tds-settings" element={<TdsPage />} />
                <Route path="tcs-rates" element={<TcsPage />} />
                <Route path="units" element={<UnitsPage />} />
                <Route path="product-categories" element={<CategoriesPage />} />
                <Route path="labs" element={<LabsPage />} />
                <Route path="sales-persons" element={<SalesPersonsPage />} />
                <Route path="terms-conditions" element={<TermsPage />} />
                <Route path="cheque-books" element={<ChequeBooksPage />} />
                <Route path="carriers" element={<CarriersPage />} />
                <Route path="shipment-statuses" element={<ShipmentStatusesPage />} />
                <Route path="price-lists" element={<PriceListsPage />} />
                <Route path="product-name-templates" element={<ProductNameTemplatesPage />} />
                <Route path="payment-modes" element={<PaymentModesPage />} />
                <Route path="payment-terms" element={<PaymentTermsPage />} />
                <Route path="products" element={<ProductsPage />} />
                <Route path="opening-stock" element={<OpeningStockPage />} />
                <Route path="rapaport-prices" element={<RapaportPricePage />} />
                <Route path="rapaport-additional-back" element={<RapaportAdditionalBackPage />} />
                <Route path="rapaport-custom-size" element={<RapaportCustomSizePage />} />
                <Route path="product-barcode" element={<BarcodeSettingsPage />} />
                <Route path="*" element={<ComingSoon />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}
