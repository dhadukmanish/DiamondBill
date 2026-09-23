import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Boxes, Check, Save, Trash2 } from 'lucide-react';
import { PRODUCT_STOCK_TYPE_LABELS, type FilterFieldDef } from '@diamondbill/shared';
import { DataTable, useListState, type Column } from '@/components/data/DataTable';
import { KpiTiles } from '@/components/data/Kpi';
import { ItemPicker, type ItemOption } from '@/components/data/ItemPicker';
import { Badge, Checkbox, ConfirmDialog, EmptyState, Select, Spinner, TextInput } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { useBranches, useFirms, useList, useSave } from '@/lib/queries';
import { useAuthStore } from '@/store/auth';
import { cx, fmtMoney, fmtNum } from '@/lib/format';

const useCategories = () => useQuery({ queryKey: ['lookup-masters'], queryFn: () => api.get<any>('/api/common/lookups/masters'), staleTime: 60_000, select: (d) => (d?.categories ?? []) as { id: string; name: string }[] });
const stockTypeOpts = Object.entries(PRODUCT_STOCK_TYPE_LABELS).filter(([v]) => v !== 'certified').map(([value, label]) => ({ value, label }));

/** Firm / branch pair used by every stock screen. Defaults to the default firm + branch. */
export function useFirmBranch(required = false) {
  const firms = useFirms();
  const [firmId, setFirmId] = useState('');
  const [branchId, setBranchId] = useState('');
  const branches = useBranches(firmId || undefined);
  useEffect(() => { if (required && !firmId && firms.data?.length) setFirmId((firms.data.find((f) => f.isDefault) ?? firms.data[0]).id); }, [firms.data, required]); // eslint-disable-line
  useEffect(() => { if (required && firmId && !branchId && branches.data?.length) setBranchId((branches.data.find((b) => b.isDefault) ?? branches.data[0]).id); }, [branches.data, firmId, required]); // eslint-disable-line
  const selects = (
    <>
      <Select size="sm" className="w-[160px]" value={firmId} onChange={(v) => { setFirmId(v); setBranchId(''); }} placeholder={required ? 'Select firm' : 'All Firms'} options={(firms.data ?? []).map((f) => ({ value: f.id, label: f.name }))} />
      <Select size="sm" className="w-[150px]" value={branchId} onChange={setBranchId} placeholder={required ? 'Select branch' : 'All Branches'} options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
    </>
  );
  return { firmId, branchId, setFirmId, setBranchId, firms: firms.data ?? [], branches: branches.data ?? [], selects };
}

/* ======================= Stock View ======================= */
export function StockViewPage() {
  const [state, setState] = useListState({ sortBy: 'productName', sortOrder: 'asc' });
  const fb = useFirmBranch();
  const [removeZero, setRemoveZero] = useState(false);
  const [stockType, setStockType] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const cats = useCategories();
  const q = useList<any>('stock-view', '/api/accounting/inventory/stock-view', { ...state, page: 1, limit: 5000, sortBy: undefined }, { firmId: fb.firmId, branchId: fb.branchId, removeZero, stockType, categoryId });
  const k = q.data?.kpis;
  const columns: Column<any>[] = [
    { key: 'productName', header: 'Product', locked: true, render: (r) => <div><div className="font-medium text-gray-900">{r.productName}</div><div className="text-[11px] text-gray-500">{r.itemName}</div></div> },
    { key: 'sku', header: 'SKU', render: (r) => <span className="font-mono text-[12px]">{r.sku}</span> },
    { key: 'unitName', header: 'Unit', hidden: true, render: (r) => r.unitName || '-' },
    { key: 'totalIn', header: 'Total In', align: 'right', hidden: true, render: (r) => fmtNum(r.totalIn, 3) },
    { key: 'totalOut', header: 'Total Out', align: 'right', hidden: true, render: (r) => fmtNum(r.totalOut, 3) },
    { key: 'qtyOnHand', header: 'On Hand', align: 'right', render: (r) => <span className={cx('font-medium', r.qtyOnHand < 0 ? 'text-red-600' : 'text-gray-900')}>{fmtNum(r.qtyOnHand, 3)}</span> },
    { key: 'memoOut', header: 'Memo Out', align: 'right', render: (r) => fmtNum(r.memoOut, 3) },
    { key: 'soCommitted', header: 'Committed (SO)', align: 'right', hidden: true, render: (r) => fmtNum(r.soCommitted, 3) },
    { key: 'saleable', header: 'Available for Sale', align: 'right', render: (r) => fmtNum(r.saleable, 3) },
    { key: 'avgRate', header: 'Avg Rate', align: 'right', render: (r) => fmtMoney(r.avgRate) },
    { key: 'value', header: 'Asset Value', align: 'right', render: (r) => fmtMoney(r.value) },
    { key: 'sellingPrice', header: 'Selling Price', align: 'right', hidden: true, render: (r) => fmtMoney(r.sellingPrice) },
    { key: 'currentValue', header: 'Stock Value (Selling)', align: 'right', render: (r) => fmtMoney(r.currentValue) },
    { key: 'lowStock', header: 'Alert', sortable: false, render: (r) => (r.lowStock ? <Badge color="amber">Low stock</Badge> : null) },
  ];
  const filterFields: FilterFieldDef[] = [{ key: 'productName', label: 'Product' }, { key: 'sku', label: 'SKU' }, { key: 'qtyOnHand', label: 'On Hand', type: 'number' }, { key: 'saleable', label: 'Available', type: 'number' }, { key: 'value', label: 'Asset Value', type: 'number' }];
  return (
    <>
      <h2 className="mb-3 text-[20px] font-semibold text-gray-900">Stock View</h2>
      <KpiTiles items={[{ label: 'Total Items', value: k?.totalItems ?? 0 }, { label: 'On Memo', value: fmtNum(k?.memoOut ?? 0, 3), tone: 'warn' }, { label: 'Low Stock', value: k?.lowStock ?? 0, tone: k?.lowStock ? 'bad' : 'default' }, { label: 'Stock Value (Selling)', value: fmtMoney(k?.totalStockValue ?? 0) }, { label: 'Inventory Asset Value', value: fmtMoney(k?.inventoryAssetValue ?? 0), hint: k?.valuation ? `${String(k.valuation).toUpperCase()} valuation` : undefined }]} />
      <DataTable storageKey="stock-view" clientSide filterFields={filterFields} columns={columns} rows={q.data?.rows ?? []} total={q.data?.total} loading={q.isFetching} state={state} onStateChange={setState} rowKey={(r) => r.id} onRefresh={() => q.refetch()} searchPlaceholder="Search product / SKU"
        toolbar={<>
          {fb.selects}
          <Select size="sm" className="w-[150px]" value={stockType} onChange={setStockType} placeholder="All Stock Types" options={stockTypeOpts} />
          <Select size="sm" className="w-[150px]" value={categoryId} onChange={setCategoryId} placeholder="All Categories" options={(cats.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <Checkbox checked={removeZero} onChange={setRemoveZero} label="Remove zero stock" />
        </>}
        emptyTitle="No stock yet" emptyDescription="Add products and set opening stock or make a purchase to see stock here." />
    </>
  );
}

/* ======================= Branch-wise Stock ======================= */
export function BranchWiseStockPage() {
  const firms = useFirms();
  const [firmId, setFirmId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const cats = useCategories();
  const q = useQuery({ queryKey: ['branch-wise-stock', firmId, categoryId], queryFn: () => api.get<{ branches: { id: string; name: string; firmId: string }[]; rows: any[] }>(`/api/accounting/inventory/branch-wise-stock${qs({ firmId, categoryId })}`), placeholderData: (x) => x });
  const [state, setState] = useListState({ limit: 50, sortBy: 'productName', sortOrder: 'asc' });
  const branches = q.data?.branches ?? [];
  const columns: Column<any>[] = [
    { key: 'productName', header: 'Product', locked: true, render: (r) => <div><div className="font-medium text-gray-900">{r.productName}</div><div className="text-[11px] text-gray-500">{r.itemName} · <span className="font-mono">{r.sku}</span></div></div> },
    ...branches.map<Column<any>>((b) => ({ key: `b_${b.id}`, header: b.name, align: 'right', sortValue: (r) => r.byBranch[b.id] ?? 0, render: (r) => <span className={cx(!r.byBranch[b.id] && 'text-gray-300')}>{fmtNum(r.byBranch[b.id] ?? 0, 3)}</span> })),
    { key: 'total', header: 'Total', align: 'right', render: (r) => <b>{fmtNum(r.total, 3)}</b> },
  ];
  return (
    <>
      <h2 className="mb-3 text-[20px] font-semibold text-gray-900">Branch-wise Stock View</h2>
      <DataTable storageKey={`branch-wise-${firmId || 'all'}`} clientSide searchPlaceholder="Search product / SKU" columns={columns} rows={q.data?.rows ?? []} loading={q.isFetching} state={state} onStateChange={setState} rowKey={(r) => r.id} onRefresh={() => q.refetch()}
        toolbar={<>
          <Select size="sm" className="w-[160px]" value={firmId} onChange={setFirmId} placeholder="All Firms" options={(firms.data ?? []).map((f) => ({ value: f.id, label: f.name }))} />
          <Select size="sm" className="w-[150px]" value={categoryId} onChange={setCategoryId} placeholder="All Categories" options={(cats.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
        </>}
        emptyTitle="No stock in any branch" />
    </>
  );
}

/* ======================= Month-wise Summary ======================= */
export function MonthWiseSummaryPage() {
  const fb = useFirmBranch();
  const [item, setItem] = useState<ItemOption | null>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const q = useQuery({ queryKey: ['month-wise', item?.id, fb.firmId, fb.branchId, year], queryFn: () => api.get<{ year: number; months: any[] }>(`/api/accounting/inventory/month-wise-summary${qs({ productItemId: item?.id, firmId: fb.firmId, branchId: fb.branchId, year })}`), enabled: !!item });
  const years = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i));
  const mName = (m: string) => new Date(`${m}-01`).toLocaleString('en', { month: 'short', year: 'numeric' });
  const months = q.data?.months ?? [];
  return (
    <>
      <h2 className="mb-3 text-[20px] font-semibold text-gray-900">Month-wise Stock Summary</h2>
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="w-[360px]"><label className="label">Sub Product</label><ItemPicker value={item} onChange={setItem} firmId={fb.firmId} branchId={fb.branchId} /></div>
        <div><label className="label">Firm / Branch</label><div className="flex gap-2">{fb.selects}</div></div>
        <div><label className="label">Year</label><Select size="sm" className="w-[110px]" value={year} onChange={setYear} options={years.map((y) => ({ value: y, label: y }))} /></div>
      </div>
      {!item ? <EmptyState icon={<Boxes className="h-8 w-8" />} title="Select a sub-product" description="Pick a product to see its month-wise opening, in, out and closing quantities." /> : (
        <div className="card overflow-hidden">
          {q.isFetching && <div className="h-0.5 w-full animate-pulse bg-primary/40" />}
          <table className="w-full text-[13px]">
            <thead><tr className="bg-head text-left">{['Month', 'Opening', 'In', 'Out', 'Memo Out', 'Memo In', 'Closing'].map((h, i) => <th key={h} className={cx('table-head', i > 0 && 'text-right')}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {months.map((m) => (
                <tr key={m.month} className="hover:bg-gray-50">
                  <td className="table-cell font-medium text-gray-900">{mName(m.month)}</td>
                  <td className="table-cell text-right">{fmtNum(m.opening, 3)}</td>
                  <td className="table-cell text-right text-green-700">{m.in ? `+${fmtNum(m.in, 3)}` : '-'}</td>
                  <td className="table-cell text-right text-red-600">{m.out ? `−${fmtNum(m.out, 3)}` : '-'}</td>
                  <td className="table-cell text-right">{m.memoOut ? fmtNum(m.memoOut, 3) : '-'}</td>
                  <td className="table-cell text-right">{m.memoIn ? fmtNum(m.memoIn, 3) : '-'}</td>
                  <td className="table-cell text-right font-semibold text-gray-900">{fmtNum(m.closing, 3)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="bg-gray-50 font-medium"><td className="table-cell">Total {year}</td><td className="table-cell text-right">{fmtNum(months[0]?.opening ?? 0, 3)}</td><td className="table-cell text-right text-green-700">{fmtNum(months.reduce((s, m) => s + m.in, 0), 3)}</td><td className="table-cell text-right text-red-600">{fmtNum(months.reduce((s, m) => s + m.out, 0), 3)}</td><td className="table-cell text-right">{fmtNum(months.reduce((s, m) => s + m.memoOut, 0), 3)}</td><td className="table-cell text-right">{fmtNum(months.reduce((s, m) => s + m.memoIn, 0), 3)}</td><td className="table-cell text-right text-gray-900">{fmtNum(months[11]?.closing ?? 0, 3)}</td></tr></tfoot>
          </table>
        </div>
      )}
    </>
  );
}

/* ======================= Stock Tally ======================= */
export function StockTallyPage() {
  const fb = useFirmBranch(true);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [stockType, setStockType] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'pending' | 'counted'>('pending');
  const can = useAuthStore((s) => s.can);
  const q = useQuery({ queryKey: ['stock-tally', fb.firmId, fb.branchId, date, stockType, search], queryFn: () => api.get<{ pending: any[]; counted: any[]; summary: { total: number; counted: number; matched: number; extra: number } }>(`/api/accounting/inventory/stock-tally${qs({ firmId: fb.firmId, branchId: fb.branchId, tallyDate: date, stockType, search })}`), enabled: !!fb.firmId && !!date, placeholderData: (x) => x });
  const [counts, setCounts] = useState<Record<string, string>>({});
  useEffect(() => setCounts({}), [fb.firmId, fb.branchId, date]);
  const save = useSave({ invalidate: ['stock-tally'], onSuccess: () => setCounts({}) });
  const clear = useSave({ invalidate: ['stock-tally'], onSuccess: () => setConfirmClear(false) });
  const [confirmClear, setConfirmClear] = useState(false);
  const s = q.data?.summary;
  const dirty = Object.entries(counts).filter(([, v]) => v !== '');
  const submit = () => save.mutate({ method: 'put', url: '/api/accounting/inventory/stock-tally', body: { firmId: fb.firmId, branchId: fb.branchId || null, tallyDate: date, counts: dirty.map(([productItemId, v]) => ({ productItemId, countedQty: Number(v) })) } });
  const rows = tab === 'pending' ? q.data?.pending ?? [] : q.data?.counted ?? [];
  const [state, setState] = useListState({ limit: 50, sortBy: 'productName', sortOrder: 'asc' });
  const columns: Column<any>[] = [
    { key: 'productName', header: 'Product', locked: true, render: (r) => <div><div className="font-medium text-gray-900">{r.productName}</div><div className="text-[11px] text-gray-500">{r.itemName}</div></div> },
    { key: 'sku', header: 'SKU', render: (r) => <span className="font-mono text-[12px]">{r.sku}</span> },
    { key: 'barcode', header: 'Barcode', hidden: true, render: (r) => r.barcode || '-' },
    { key: 'systemQty', header: 'System Qty', align: 'right', render: (r) => fmtNum(r.systemQty, 3) },
    { key: 'memoOut', header: 'Memo Out', align: 'right', hidden: true, render: (r) => fmtNum(r.memoOut, 3) },
    { key: 'availableForSale', header: 'Available', align: 'right', hidden: true, render: (r) => fmtNum(r.availableForSale, 3) },
    { key: 'countedQty', header: 'Counted Qty', align: 'right', sortable: false, width: 160, render: (r) => (
      <input type="number" step="any" min={0} className="input input-sm w-[130px] text-right" placeholder={r.countedQty != null ? fmtNum(r.countedQty, 3) : '0'} value={counts[r.productItemId] ?? ''} onChange={(e) => setCounts((c) => ({ ...c, [r.productItemId]: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && dirty.length && submit()} />
    ) },
    { key: 'diff', header: 'Difference', align: 'right', sortable: false, render: (r) => { const v = counts[r.productItemId] !== undefined && counts[r.productItemId] !== '' ? Number(counts[r.productItemId]) : r.countedQty; if (v == null) return '-'; const d = v - r.systemQty; return <span className={cx('font-medium', Math.abs(d) < 0.00005 ? 'text-green-700' : 'text-red-600')}>{Math.abs(d) < 0.00005 ? <Check className="inline h-4 w-4" /> : (d > 0 ? '+' : '') + fmtNum(d, 3)}</span>; } },
  ];
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[20px] font-semibold text-gray-900">Stock Tally</h2>
        <div className="flex gap-2">
          {q.data && (q.data.counted.length > 0) && can('acc_stock_tally', 'delete') && <button className="btn-outline text-red-600" onClick={() => setConfirmClear(true)}><Trash2 className="h-4 w-4" /> Clear this date</button>}
          {can('acc_stock_tally', 'update') && <button className="btn-primary" disabled={!dirty.length || save.isPending} onClick={submit}>{save.isPending ? <Spinner /> : <Save className="h-4 w-4" />} Save Count ({dirty.length})</button>}
        </div>
      </div>
      <KpiTiles className="xl:grid-cols-4" items={[{ label: 'Total Items', value: s?.total ?? 0 }, { label: 'Counted', value: s?.counted ?? 0, tone: 'good' }, { label: 'Matched', value: s?.matched ?? 0, tone: 'good' }, { label: 'Mismatched', value: s?.extra ?? 0, tone: s?.extra ? 'bad' : 'default' }]} />
      <DataTable storageKey="stock-tally" clientSide hideSearch columns={columns} rows={rows} loading={q.isFetching} state={state} onStateChange={setState} rowKey={(r) => r.productItemId} onRefresh={() => q.refetch()}
        toolbar={<>
          <div className="flex rounded-lg border border-line p-0.5 text-[13px]">{(['pending', 'counted'] as const).map((v) => <button key={v} onClick={() => setTab(v)} className={cx('rounded-md px-3 py-1 capitalize', tab === v ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50')}>{v} ({v === 'pending' ? q.data?.pending.length ?? 0 : q.data?.counted.length ?? 0})</button>)}</div>
          <TextInput size="sm" className="w-[200px]" placeholder="Search / scan barcode" value={search} onChange={(e) => setSearch(e.target.value)} />
          {fb.selects}
          <TextInput size="sm" type="date" className="w-[150px]" value={date} onChange={(e) => setDate(e.target.value)} />
          <Select size="sm" className="w-[140px]" value={stockType} onChange={setStockType} placeholder="All Types" options={stockTypeOpts} />
        </>}
        emptyTitle={tab === 'pending' ? 'Everything counted' : 'Nothing counted yet'} emptyDescription={tab === 'pending' ? 'All items for this date have a physical count.' : 'Enter counted quantities on the Pending tab and save.'} />
      {s && s.extra > 0 && <p className="mt-3 flex items-center gap-2 text-[13px] text-amber-700"><AlertTriangle className="h-4 w-4" /> {s.extra} item(s) differ from system quantity — create a Stock Adjustment to correct them.</p>}
      <ConfirmDialog open={confirmClear} onClose={() => setConfirmClear(false)} loading={clear.isPending} title="Clear this date's count?" message="All counted quantities for the selected firm/branch/date will be removed." confirmText="Clear" onConfirm={() => clear.mutate({ method: 'delete', url: `/api/accounting/inventory/stock-tally${qs({ firmId: fb.firmId, branchId: fb.branchId, tallyDate: date })}` })} />
    </>
  );
}

