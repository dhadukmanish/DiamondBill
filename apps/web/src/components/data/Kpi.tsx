import type { ReactNode } from 'react';
import { cx } from '@/lib/format';

/** Row of KPI tiles as used on Stock View / Certified Products / Banking headers. */
export function KpiTiles({ items, className }: { items: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'good' | 'warn' | 'bad' }[]; className?: string }) {
  return (
    <div className={cx('mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5', className)}>
      {items.map((k) => (
        <div key={k.label} className="card px-4 py-3">
          <div className="text-[12px] font-medium uppercase tracking-wide text-gray-500">{k.label}</div>
          <div className={cx('mt-1 font-heading text-[20px] font-semibold', k.tone === 'good' ? 'text-green-700' : k.tone === 'warn' ? 'text-amber-700' : k.tone === 'bad' ? 'text-red-700' : 'text-gray-900')}>{k.value}</div>
          {k.hint && <div className="text-[12px] text-gray-500">{k.hint}</div>}
        </div>
      ))}
    </div>
  );
}
