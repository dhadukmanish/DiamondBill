import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { PRODUCT_STOCK_TYPE_LABELS } from '@diamondbill/shared';
import { DataTable, useListState, type Column } from '@/components/data/DataTable';
import { Badge, Select, Spinner } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { useBranches, useCurrencies, useFirms, useFiscalYears, useSave } from '@/lib/queries';
import { useAuthStore } from '@/store/auth';
import { cx, fmtMoney, fmtNum } from '@/lib/format';

type Line = { qty: string; rate: string; currency: string; exchangeRate: string };

/** Settings → Opening Stock: per firm / branch / FY quantities that seed FIFO lots on the FY start date. */
export default function OpeningStockPage() {
  const firms = useFirms();
  const [firmId, setFirmId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [fyId, setFyId] = useState('');
  const [stockType, setStockType] = useState('');
  const branches = useBranches(firmId || undefined);
  const fys = useFiscalYears(firmId || undefined);
  const currencies = useCurrencies();
  useEffect(() => { if (!firmId && firms.data?.length) setFirmId((firms.data.find((f) => f.isDefault) ?? firms.data[0]).id); }, [firms.data]); // eslint-disable-line
  useEffect(() => { if (firmId && branches.data?.length && !branches.data.some((b) => b.id === branchId)) setBranchId((branches.data.find((b) => b.isDefault) ?? branches.data[0]).id); }, [branches.data, firmId]); // eslint-disable-line
  useEffect(() => { if (firmId && fys.data?.length && !fys.data.some((f) => f.id === fyId)) setFyId((fys.data.find((f) => f.isActive) ?? fys.data[0]).id); }, [fys.data, firmId]); // eslint-disable-line
  const q = useQuery({ queryKey: ['opening-stock', firmId, branchId, fyId, stockType], queryFn: () => api.get<{ rows: any[] }>(`/api/accounting/inventory/opening-stock${qs({ firmId, branchId, fiscalYearId: fyId, stockType })}`), enabled: !!firmId && !!branchId && !!fyId, placeholderData: (x) => x });
  const [edits, setEdits] = useState<Record<string, Line>>({});
  useEffect(() => setEdits({}), [firmId, branchId, fyId]);
  const can = useAuthStore((s) => s.can);
  const save = useSave({ invalidate: ['opening-stock', 'stock-view', 'items-lookup'], onSuccess: () => setEdits({}) });
  const line = (r: any): Line => edits[r.productItemId] ?? { qty: r.saved ? String(r.qty) : '', rate: String(r.rate ?? ''), currency: r.currency ?? 'INR', exchangeRate: String(r.exchangeRate ?? 1) };
  const upd = (r: any, k: keyof Line, v: string) => setEdits((e) => ({ ...e, [r.productItemId]: { ...line(r), [k]: v } }));
  const dirty = Object.keys(edits);
  const rows = q.data?.rows ?? [];
  const total = useMemo(() => rows.reduce((s, r) => { const l = line(r); return s + Number(l.qty || 0) * Number(l.rate || 0) * Number(l.exchangeRate || 1); }, 0), [rows, edits]); // eslint-disable-line
  const submit = () => save.mutate({ method: 'put', url: '/api/accounting/inventory/opening-stock', body: { firmId, branchId, fiscalYearId: fyId, lines: dirty.map((id) => { const l = edits[id]; return { productItemId: id, qty: Number(l.qty || 0), rate: Number(l.rate || 0), currency: l.currency || 'INR', exchangeRate: Number(l.exchangeRate || 1) }; }) } });
  const [state, setState] = useListState({ limit: 50, sortBy: 'productName', sortOrder: 'asc' });
  const fy = fys.data?.find((f) => f.id === fyId);
  const curOpts = (currencies.data ?? []).map((c: any) => ({ value: c.code, label: c.code }));
  const columns: Column<any>[] = [
    { key: 'productName', header: 'Product', locked: true, render: (r) => <div><div className="font-medium text-gray-900">{r.productName}</div><div className="text-[11px] text-gray-500">{r.itemName} · <span className="font-mono">{r.sku}</span></div></div> },
    { key: 'stockType', header: 'Type', hidden: true, render: (r) => PRODUCT_STOCK_TYPE_LABELS[r.stockType as keyof typeof PRODUCT_STOCK_TYPE_LABELS] ?? r.stockType },
    { key: 'unitName', header: 'Unit', render: (r) => r.unitName || '-' },
    { key: 'qty', header: 'Opening Qty', align: 'right', sortable: false, render: (r) => <input type="number" step="any" min={0} className={cx('input input-sm w-[120px] text-right', edits[r.productItemId] && 'border-primary')} value={line(r).qty} placeholder="0" onChange={(e) => upd(r, 'qty', e.target.value)} /> },
    { key: 'rate', header: 'Rate', align: 'right', sortable: false, render: (r) => <input type="number" step="any" min={0} className="input input-sm w-[120px] text-right" value={line(r).rate} onChange={(e) => upd(r, 'rate', e.target.value)} /> },
    { key: 'currency', header: 'Currency', sortable: false, render: (r) => curOpts.length ? <Select size="sm" className="w-[90px]" value={line(r).currency} onChange={(v) => upd(r, 'currency', v)} options={curOpts} /> : line(r).currency },
    { key: 'exchangeRate', header: 'Exch. Rate', align: 'right', sortable: false, hidden: true, render: (r) => <input type="number" step="any" min={0} className="input input-sm w-[90px] text-right" value={line(r).exchangeRate} onChange={(e) => upd(r, 'exchangeRate', e.target.value)} /> },
    { key: 'total', header: 'Total', align: 'right', sortable: false, render: (r) => { const l = line(r); return <span className="font-medium">{fmtMoney(Number(l.qty || 0) * Number(l.rate || 0) * Number(l.exchangeRate || 1))}</span>; } },
    { key: 'saved', header: 'Status', sortable: false, render: (r) => (edits[r.productItemId] ? <Badge color="blue">Edited</Badge> : r.saved ? <Badge color="green">Saved</Badge> : <span className="text-gray-400">-</span>) },
  ];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-[20px] font-semibold text-gray-900">Opening Stock</h2><p className="text-[13px] text-gray-500">Stock on hand at the start of {fy ? `${fy.name} (${fy.startDate})` : 'the financial year'}. Saving replaces the previous opening for each edited item.</p></div>
        <div className="flex items-center gap-3 text-[13px]"><span className="text-gray-600">Total <b className="text-gray-900">{fmtMoney(total)}</b></span>{can('acc_opening_stock', 'update') && <button className="btn-primary" disabled={!dirty.length || save.isPending} onClick={submit}>{save.isPending ? <Spinner /> : <Save className="h-4 w-4" />} Save ({dirty.length})</button>}</div>
      </div>
      <DataTable storageKey="opening-stock" clientSide columns={columns} rows={rows} loading={q.isFetching} state={state} onStateChange={setState} rowKey={(r) => r.productItemId} onRefresh={() => q.refetch()} searchPlaceholder="Search product / SKU"
        toolbar={<>
          <Select size="sm" className="w-[160px]" value={firmId} onChange={(v) => { setFirmId(v); setBranchId(''); setFyId(''); }} options={(firms.data ?? []).map((f) => ({ value: f.id, label: f.name }))} />
          <Select size="sm" className="w-[150px]" value={branchId} onChange={setBranchId} options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
          <Select size="sm" className="w-[150px]" value={fyId} onChange={setFyId} options={(fys.data ?? []).map((f) => ({ value: f.id, label: f.name }))} />
          <Select size="sm" className="w-[150px]" value={stockType} onChange={setStockType} placeholder="All Stock Types" options={Object.entries(PRODUCT_STOCK_TYPE_LABELS).filter(([v]) => v !== 'certified').map(([value, label]) => ({ value, label }))} />
        </>}
        emptyTitle="No products" emptyDescription="Add products first (Accounting → Products), then enter their opening quantities here." />
      <p className="mt-2 text-[12px] text-gray-500">{fmtNum(rows.length, 0)} items · Certified stones get their opening stock from the stone itself.</p>
    </>
  );
}
