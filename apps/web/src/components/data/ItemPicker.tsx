import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { api, qs } from '@/lib/api';
import { cx, fmtNum } from '@/lib/format';

export interface ItemOption { id: string; productId: string; productName: string; name: string; sku: string; stockType: string; unitId: string | null; taxGroupId: string | null; hsnCode: string | null; currency: string; purchasePrice: number; sellingPrice: number; weight: number | null; status: string; qtyOnHand: number; saleable: number; display: string }

export function useItemsLookup(p: { search?: string; stockType?: string; firmId?: string; branchId?: string; enabled?: boolean }) {
  return useQuery({ queryKey: ['items-lookup', p], queryFn: () => api.get<ItemOption[]>(`/api/accounting/products/items/lookup${qs({ search: p.search, stockType: p.stockType, firmId: p.firmId, branchId: p.branchId, limit: 100 })}`), enabled: p.enabled !== false, staleTime: 15_000, placeholderData: (x) => x });
}

/** Searchable product/sub-product picker showing SKU, name and available qty (for the given firm/branch). */
export function ItemPicker({ value, onChange, stockType, firmId, branchId, placeholder = 'Search product / SKU...', disabled, size, autoFocus, exclude }: { value?: ItemOption | null; onChange: (it: ItemOption | null) => void; stockType?: string; firmId?: string; branchId?: string; placeholder?: string; disabled?: boolean; size?: 'sm'; autoFocus?: boolean; exclude?: string[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  const items = useItemsLookup({ search: debounced, stockType, firmId, branchId, enabled: open });
  const list = useMemo(() => (items.data ?? []).filter((i) => !exclude?.includes(i.id)), [items.data, exclude]);
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  useEffect(() => {
    if (!open) return;
    const place = () => { const r = ref.current?.getBoundingClientRect(); if (r) setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 420) }); };
    place();
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && !popRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h); window.addEventListener('resize', place); document.addEventListener('scroll', place, true);
    return () => { document.removeEventListener('mousedown', h); window.removeEventListener('resize', place); document.removeEventListener('scroll', place, true); };
  }, [open]);
  const [hi, setHi] = useState(0);
  useEffect(() => setHi(0), [list]);
  return (
    <div ref={ref} className="relative">
      {value && !open ? (
        <div className={cx('input flex items-center gap-2 pr-8', size === 'sm' && 'input-sm')} onClick={() => !disabled && setOpen(true)}>
          <span className="font-mono text-[12px] text-gray-500">{value.sku}</span>
          <span className="truncate text-gray-800">{value.name}</span>
          {!disabled && <X className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-gray-800" onClick={(e) => { e.stopPropagation(); onChange(null); }} />}
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input autoFocus={autoFocus} disabled={disabled} value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} placeholder={placeholder} className={cx('input pl-9', size === 'sm' && 'input-sm')}
            onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); } else if (e.key === 'Enter' && list[hi]) { e.preventDefault(); onChange(list[hi]); setOpen(false); setQ(''); } else if (e.key === 'Escape') setOpen(false); }} />
        </div>
      )}
      {open && createPortal(
        <div ref={popRef} style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }} className="z-[100] card shadow-lg overflow-hidden">
          <ul className="max-h-72 overflow-y-auto py-1">
            {items.isFetching && list.length === 0 && <li className="px-3 py-2 text-[13px] text-gray-500">Searching…</li>}
            {!items.isFetching && list.length === 0 && <li className="px-3 py-2 text-[13px] text-gray-500">No products found</li>}
            {list.map((it, i) => (
              <li key={it.id} onMouseEnter={() => setHi(i)} onClick={() => { onChange(it); setOpen(false); setQ(''); }} className={cx('flex cursor-pointer items-center gap-3 px-3 py-2 text-[13px]', i === hi ? 'bg-primary-lighter/40' : 'hover:bg-gray-50')}>
                <span className="w-[110px] shrink-0 font-mono text-[12px] text-gray-500">{it.sku}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-gray-900">{it.name}</span><span className="block truncate text-[11px] text-gray-500">{it.productName}</span></span>
                <span className="shrink-0 text-right"><span className={cx('block text-[12px] font-medium', it.saleable > 0 ? 'text-green-700' : 'text-gray-400')}>{fmtNum(it.saleable, 3)} avl</span><span className="block text-[11px] text-gray-500">₹{fmtNum(it.sellingPrice)}</span></span>
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}
