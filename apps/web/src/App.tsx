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
