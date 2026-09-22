import { Link, useLocation } from 'react-router-dom';
import { Construction, Users, BookOpen, Settings, Gem, Receipt, ShoppingCart, ArrowRight } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useFirms } from '@/lib/queries';

export function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const firms = useFirms();
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const shortcuts = [
    { label: 'Contacts', desc: 'Customers, vendors & brokers', href: '/modules/crm/contacts', icon: Users },
    { label: 'Chart of Accounts', desc: 'Ledgers & groups', href: '/modules/accounting/masters/chart-of-accounts', icon: BookOpen },
    { label: 'Certified Products', desc: 'Stone-wise inventory', href: '/modules/accounting/certified-products', icon: Gem },
    { label: 'Purchase Bills', desc: 'Record purchases', href: '/modules/accounting/purchase/bills', icon: ShoppingCart },
    { label: 'Invoices', desc: 'Bill your customers', href: '/modules/accounting/sales/invoices', icon: Receipt },
    { label: 'Settings', desc: 'Firm, series, users, custom fields', href: '/modules/settings', icon: Settings },
  ];
  return (
    <div>
      <h2 className="text-[22px] font-semibold text-gray-900">{greet}, {user?.firstName} 👋</h2>
      <p className="mt-1 text-[14px] text-gray-500">{firms.data?.length ? `${firms.data.length} firm(s) · ` : ''}Here is a quick overview of your workspace.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shortcuts.map((s) => (
          <Link key={s.href} to={s.href} className="card group flex items-center gap-4 p-5 transition hover:border-primary">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-lighter text-primary"><s.icon className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><div className="text-[15px] font-medium text-gray-900">{s.label}</div><div className="text-[12.5px] text-gray-500">{s.desc}</div></div>
            <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ComingSoon({ title }: { title?: string }) {
  const { pathname } = useLocation();
  const name = title ?? pathname.split('/').filter(Boolean).slice(-1)[0]?.replace(/-/g, ' ');
  return (
    <div className="card flex flex-col items-center justify-center py-24 text-center">
      <Construction className="h-10 w-10 text-gray-300" />
      <h3 className="mt-3 text-[18px] font-semibold capitalize text-gray-800">{name}</h3>
      <p className="mt-1 text-[13px] text-gray-500">This module is part of the next build phase.</p>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="font-heading text-[64px] font-semibold text-gray-200">404</div>
      <p className="text-[15px] text-gray-600">The page you are looking for doesn't exist.</p>
      <Link to="/dashboard" className="btn-primary mt-5">Go to Home</Link>
    </div>
  );
}
