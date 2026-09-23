import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, Eye, Plus, Trash2, X } from 'lucide-react';
import { ADJUSTMENT_MODES, type FilterFieldDef } from '@diamondbill/shared';
import { DataTable, useListState, type Column } from '@/components/data/DataTable';
import { ItemPicker, type ItemOption } from '@/components/data/ItemPicker';
import { Badge, ConfirmDialog, Field, Modal, Select, Spinner, TextArea, TextInput } from '@/components/ui';
import { api, ApiError, qs } from '@/lib/api';
import { useBranches, useFirms, useList, useSave, useSettings } from '@/lib/queries';
import { useAuthStore } from '@/store/auth';
import { cx, fmtDate, fmtMoney, fmtNum } from '@/lib/format';

const today = () => new Date().toISOString().slice(0, 10);
const MODE_LABELS: Record<string, string> = { damaged: 'Damaged', lost: 'Lost / Stolen', found: 'Found', correction: 'Correction', sample: 'Sample / Gift', expired: 'Expired', other: 'Other' };

/** Series for a document type within a firm (default first). */
function useSeries(firmId: string, usedFor: string) {
  return useQuery({ queryKey: ['series', firmId, usedFor], queryFn: () => api.get<{ rows: any[] }>(`/api/crm/master/series${qs({ firmId, usedFor, limit: 100 })}`), enabled: !!firmId, staleTime: 60_000, select: (d) => [...d.rows].sort((a, b) => Number(b.isDefault) - Number(a.isDefault)) });
}

/** Firm → Branch → Series → Number → Date header shared by adjustments / transfers. */
function DocHeader({ v, set, usedFor, errors, extra, firmLabel = 'Firm', branchLabel = 'Branch' }: { v: any; set: (k: string, val: any) => void; usedFor: string; errors: Record<string, string>; extra?: ReactNode; firmLabel?: string; branchLabel?: string }) {
  const firms = useFirms();
  const branches = useBranches(v.firmId || undefined);
  const series = useSeries(v.firmId, usedFor);
  useEffect(() => { if (!v.firmId && firms.data?.length) set('firmId', (firms.data.find((f) => f.isDefault) ?? firms.data[0]).id); }, [firms.data]); // eslint-disable-line
  useEffect(() => { if (v.firmId && !v.branchId && branches.data?.length) set('branchId', (branches.data.find((b) => b.isDefault) ?? branches.data[0]).id); }, [branches.data, v.firmId]); // eslint-disable-line
  useEffect(() => { if (series.data && !v.seriesId && series.data[0]) set('seriesId', series.data[0].id); }, [series.data]); // eslint-disable-line
  const sel = series.data?.find((s) => s.id === v.seriesId);
  return (
    <div className="grid gap-x-4 gap-y-3 sm:grid-cols-3">
      <Field label={firmLabel} required error={errors.firmId}><Select value={v.firmId} onChange={(x) => { set('firmId', x); set('branchId', ''); set('seriesId', ''); }} options={(firms.data ?? []).map((f) => ({ value: f.id, label: f.name }))} /></Field>
      <Field label={branchLabel} required error={errors.branchId}><Select value={v.branchId} onChange={(x) => set('branchId', x)} options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} /></Field>
      <Field label="Date" required error={errors[usedFor === 'adjustment' ? 'adjustmentDate' : 'transferDate']}><TextInput type="date" value={v.date} onChange={(e) => set('date', e.target.value)} /></Field>
      <Field label="Series" hint={series.data && !series.data.length ? 'No series — add one under Settings → Series' : undefined}><Select value={v.seriesId} onChange={(x) => set('seriesId', x)} placeholder="Auto (default series)" options={(series.data ?? []).map((s) => ({ value: s.id, label: `${s.format}${s.isDefault ? ' (default)' : ''}` }))} /></Field>
      <Field label="Number" hint={sel ? `Next: ${sel.preview}` : 'Leave blank to auto-generate'}><TextInput value={v.number} onChange={(e) => set('number', e.target.value)} placeholder={sel?.preview ?? 'Auto'} className="font-mono" /></Field>
      <Field label="Reference No"><TextInput value={v.referenceNo} onChange={(e) => set('referenceNo', e.target.value)} /></Field>
      {extra}
    </div>
  );
}

function LinesTable({ head, children, empty }: { head: string[]; children: ReactNode; empty: boolean }) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-line">
      <table className="w-full text-[13px]">
        <thead><tr className="bg-head">{head.map((h, i) => <th key={i} className={cx('table-head !px-3 !py-2', i > 0 && i < head.length - 1 && 'text-right')}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{children}{empty && <tr><td colSpan={head.length} className="px-3 py-6 text-center text-[13px] text-gray-500">Search a product above to add lines</td></tr>}</tbody>
      </table>
    </div>
  );
}

const useDoc = (init: any) => {
  const [v, setV] = useState<any>(init);
  const set = (k: string, val: any) => setV((s: any) => ({ ...s, [k]: val }));
  return [v, set, setV] as const;
};
const errMap = (e: unknown) => { const m: Record<string, string> = {}; if (e instanceof ApiError && Array.isArray(e.details)) for (const d of e.details) m[Array.isArray(d.path) ? d.path.join('.') : d.path] = d.message; return m; };

/* ======================= Stock Adjustment ======================= */
const adjInit = () => ({ firmId: '', branchId: '', seriesId: '', number: '', referenceNo: '', date: today(), mode: 'correction', note: '', lines: [] as { item: ItemOption; qty: string; rate: string }[] });

function AdjustmentForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [v, set, setV] = useDoc(adjInit());
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (open) { setV(adjInit()); setErrors({}); } }, [open]); // eslint-disable-line
  const save = useSave({ invalidate: ['adjustments', 'stock-view', 'items-lookup'], onSuccess: onClose });
  const add = (it: ItemOption | null) => it && !v.lines.some((l: any) => l.item.id === it.id) && set('lines', [...v.lines, { item: it, qty: '', rate: String(it.purchasePrice || '') }]);
  const upd = (i: number, k: string, val: string) => set('lines', v.lines.map((l: any, j: number) => (j === i ? { ...l, [k]: val } : l)));
  const total = v.lines.reduce((s: number, l: any) => s + Number(l.qty || 0) * Number(l.rate || 0), 0);
  const submit = () => save.mutate({ method: 'post', url: '/api/accounting/inventory/adjustments', body: { firmId: v.firmId, branchId: v.branchId, seriesId: v.seriesId || null, number: v.number || null, adjustmentDate: v.date, referenceNo: v.referenceNo || null, mode: v.mode, note: v.note || null, lines: v.lines.map((l: any) => ({ productItemId: l.item.id, qtyAdjusted: Number(l.qty), rate: Number(l.rate || 0) })) } }, { onError: (e) => setErrors(errMap(e)) });
  return (
    <Modal open={open} onClose={onClose} size="xl" title="New Stock Adjustment" footer={<><div className="mr-auto text-[13px] text-gray-600">Lines <b>{v.lines.length}</b> · Value <b className="text-gray-900">{fmtMoney(total)}</b></div><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={save.isPending || !v.lines.length} onClick={submit}>{save.isPending && <Spinner />} Save</button></>}>
      <DocHeader v={v} set={set} usedFor="adjustment" errors={errors} extra={<>
        <Field label="Mode" required><Select value={v.mode} onChange={(x) => set('mode', x)} options={ADJUSTMENT_MODES.map((m) => ({ value: m, label: MODE_LABELS[m] }))} /></Field>
        <Field label="Note" className="sm:col-span-2"><TextArea rows={1} value={v.note} onChange={(e) => set('note', e.target.value)} /></Field>
      </>} />
      <div className="mt-4"><label className="label">Add product</label><ItemPicker value={null} onChange={add} firmId={v.firmId} branchId={v.branchId} exclude={v.lines.map((l: any) => l.item.id)} placeholder="Search product / SKU to add a line" /></div>
      {errors.lines && <p className="mt-1 text-[12px] text-red-600">{errors.lines}</p>}
      <LinesTable head={['Product', 'Available', 'Adjust Qty (±)', 'New Qty', 'Rate', 'Value', '']} empty={!v.lines.length}>
        {v.lines.map((l: any, i: number) => (
          <tr key={l.item.id}>
            <td className="px-3 py-1.5"><div className="font-medium text-gray-900">{l.item.name}</div><div className="font-mono text-[11px] text-gray-500">{l.item.sku}</div></td>
            <td className="px-3 py-1.5 text-right">{fmtNum(l.item.qtyOnHand, 3)}</td>
            <td className="px-3 py-1.5 text-right"><input autoFocus type="number" step="any" className={cx('input input-sm w-[120px] text-right', errors[`lines.${i}.qtyAdjusted`] && 'border-red-400')} placeholder="-5 or +5" value={l.qty} onChange={(e) => upd(i, 'qty', e.target.value)} /></td>
            <td className={cx('px-3 py-1.5 text-right font-medium', l.item.qtyOnHand + Number(l.qty || 0) < 0 ? 'text-red-600' : 'text-gray-900')}>{fmtNum(l.item.qtyOnHand + Number(l.qty || 0), 3)}</td>
            <td className="px-3 py-1.5 text-right"><input type="number" step="any" min={0} className="input input-sm w-[110px] text-right" value={l.rate} onChange={(e) => upd(i, 'rate', e.target.value)} disabled={Number(l.qty) < 0} title={Number(l.qty) < 0 ? 'Outward value uses FIFO cost' : ''} /></td>
            <td className="px-3 py-1.5 text-right">{fmtMoney(Number(l.qty || 0) * Number(l.rate || 0))}</td>
            <td className="px-3 py-1.5 text-right"><button className="icon-btn h-7 w-7 text-red-600" onClick={() => set('lines', v.lines.filter((_: any, j: number) => j !== i))}><X className="h-3.5 w-3.5" /></button></td>
          </tr>
        ))}
      </LinesTable>
    </Modal>
  );
}

function DocDetail({ doc, onClose, title, head, lines }: { doc: any; onClose: () => void; title: string; head: string[]; lines: (l: any) => ReactNode[] }) {
  return (
    <Modal open={!!doc} onClose={onClose} size="lg" title={`${title} ${doc?.number ?? ''}`} footer={<button className="btn-outline" onClick={onClose}>Close</button>}>
      {doc && (<>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-4">
          <div><span className="text-gray-500">Date</span><div className="font-medium">{fmtDate(doc.adjustmentDate ?? doc.transferDate)}</div></div>
          {doc.referenceNo && <div><span className="text-gray-500">Reference</span><div className="font-medium">{doc.referenceNo}</div></div>}
          {doc.mode && <div><span className="text-gray-500">Mode</span><div className="font-medium">{MODE_LABELS[doc.mode] ?? doc.mode}</div></div>}
          {doc.status && <div><span className="text-gray-500">Status</span><div><StatusBadge s={doc.status} /></div></div>}
          {doc.fromLabel && <div><span className="text-gray-500">From</span><div className="font-medium">{doc.fromLabel}</div></div>}
          {doc.toLabel && <div><span className="text-gray-500">To</span><div className="font-medium">{doc.toLabel}</div></div>}
          <div><span className="text-gray-500">Total Value</span><div className="font-medium">{fmtMoney(doc.totalValue)}</div></div>
        </div>
        {(doc.note || doc.notes) && <p className="mt-2 text-[13px] text-gray-600">{doc.note ?? doc.notes}</p>}
        <LinesTable head={head} empty={false}>{(doc.lines ?? []).map((l: any, i: number) => <tr key={i}>{lines(l).map((c, j) => <td key={j} className={cx('px-3 py-1.5', j > 0 && 'text-right')}>{c}</td>)}</tr>)}</LinesTable>
      </>)}
    </Modal>
  );
}
const StatusBadge = ({ s }: { s: string }) => <Badge color={s === 'completed' ? 'green' : s === 'pending' ? 'amber' : 'red'}>{s[0].toUpperCase() + s.slice(1)}</Badge>;

export function StockAdjustmentsPage() {
  const [state, setState] = useListState({ sortBy: 'adjustmentDate' });
  const q = useList<any>('adjustments', '/api/accounting/inventory/adjustments', state);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  const can = useAuthStore((s) => s.can);
  const remove = useSave({ invalidate: ['adjustments', 'stock-view'], onSuccess: () => setDel(null) });
  const columns: Column<any>[] = [
    { key: 'number', header: 'Number', locked: true, render: (r) => <span className="font-mono font-medium text-primary">{r.number}</span> },
    { key: 'adjustmentDate', header: 'Date', render: (r) => fmtDate(r.adjustmentDate) },
    { key: 'firmName', header: 'Firm', hidden: true },
    { key: 'branchName', header: 'Branch' },
    { key: 'mode', header: 'Mode', render: (r) => MODE_LABELS[r.mode] ?? r.mode },
    { key: 'referenceNo', header: 'Reference', render: (r) => r.referenceNo || '-' },
    { key: 'lines', header: 'Items', align: 'right', sortable: false, render: (r) => r.lines?.length ?? 0 },
    { key: 'totalValue', header: 'Value', align: 'right', render: (r) => <span className={cx('font-medium', r.totalValue < 0 ? 'text-red-600' : 'text-green-700')}>{fmtMoney(r.totalValue)}</span> },
    { key: 'createdByName', header: 'Created By', hidden: true },
    { key: 'note', header: 'Note', hidden: true, render: (r) => r.note || '-' },
  ];
  const filterFields: FilterFieldDef[] = [{ key: 'number', label: 'Number' }, { key: 'adjustmentDate', label: 'Date', type: 'date' }, { key: 'mode', label: 'Mode', type: 'select', options: ADJUSTMENT_MODES.map((m) => ({ value: m, label: MODE_LABELS[m] })) }, { key: 'referenceNo', label: 'Reference' }, { key: 'totalValue', label: 'Value', type: 'number' }];
  return (
    <>
      <h2 className="mb-3 text-[20px] font-semibold text-gray-900">Stock Adjustments</h2>
      <DataTable storageKey="adjustments" filterFields={filterFields} columns={columns} rows={q.data?.rows ?? []} total={q.data?.total} loading={q.isFetching} state={state} onStateChange={setState} rowKey={(r) => r.id} onRefresh={() => q.refetch()} onRowClick={setView}
        actions={can('acc_stock_adjustment', 'create') && <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add</button>}
        rowActions={(r) => <span className="inline-flex gap-1"><button className="icon-btn h-7 w-7" onClick={() => setView(r)}><Eye className="h-3.5 w-3.5" /></button>{can('acc_stock_adjustment', 'delete') && <button className="icon-btn h-7 w-7 text-red-600" onClick={() => setDel(r)}><Trash2 className="h-3.5 w-3.5" /></button>}</span>}
        emptyTitle="No adjustments" emptyDescription="Record damaged, lost, found or corrected stock. Each adjustment moves stock through FIFO lots." />
      <AdjustmentForm open={open} onClose={() => setOpen(false)} />
      <DocDetail doc={view} onClose={() => setView(null)} title="Adjustment" head={['Product', 'Available', 'Adjusted', 'New Qty', 'Rate', 'Value']} lines={(l) => [<><div className="font-medium text-gray-900">{l.itemName}</div><div className="font-mono text-[11px] text-gray-500">{l.sku}</div></>, fmtNum(l.qtyAvailable, 3), <span className={l.qtyAdjusted < 0 ? 'text-red-600' : 'text-green-700'}>{l.qtyAdjusted > 0 ? '+' : ''}{fmtNum(l.qtyAdjusted, 3)}</span>, fmtNum(l.newQty, 3), fmtMoney(l.rate), fmtMoney(l.value)]} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} loading={remove.isPending} title="Delete adjustment?" message={<>Delete <b>{del?.number}</b>? Stock movements will be reversed.</>} onConfirm={() => del && remove.mutate({ method: 'delete', url: `/api/accounting/inventory/adjustments/${del.id}` })} />
    </>
  );
}

/* ======================= Stock Transfer (branch → branch) ======================= */
const trInit = () => ({ firmId: '', branchId: '', toFirmId: '', toBranchId: '', seriesId: '', number: '', referenceNo: '', date: today(), notes: '', lines: [] as { item: ItemOption; qty: string; rate: string }[] });

function TransferForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [v, set, setV] = useDoc(trInit());
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (open) { setV(trInit()); setErrors({}); } }, [open]); // eslint-disable-line
  const firms = useFirms();
  const toBranches = useBranches(v.toFirmId || undefined);
  useEffect(() => { if (!v.toFirmId && v.firmId) set('toFirmId', v.firmId); }, [v.firmId]); // eslint-disable-line
  const settings = useSettings();
  const save = useSave({ invalidate: ['transfers', 'stock-view', 'items-lookup'], onSuccess: onClose });
  const add = (it: ItemOption | null) => it && !v.lines.some((l: any) => l.item.id === it.id) && set('lines', [...v.lines, { item: it, qty: '', rate: '' }]);
  const upd = (i: number, k: string, val: string) => set('lines', v.lines.map((l: any, j: number) => (j === i ? { ...l, [k]: val } : l)));
  const submit = () => save.mutate({ method: 'post', url: '/api/accounting/inventory/transfers', body: { firmId: v.firmId, branchId: v.branchId, toFirmId: v.toFirmId, toBranchId: v.toBranchId, seriesId: v.seriesId || null, number: v.number || null, transferDate: v.date, referenceNo: v.referenceNo || null, notes: v.notes || null, lines: v.lines.map((l: any) => ({ productItemId: l.item.id, qty: Number(l.qty), unitPrice: Number(l.rate || 0) })) } }, { onError: (e) => setErrors(errMap(e)) });
  return (
    <Modal open={open} onClose={onClose} size="xl" title="New Stock Transfer" footer={<><div className="mr-auto text-[12px] text-gray-500">{settings.data?.stockTransferType === 'approval' ? 'Transfers need approval at the destination branch.' : 'Stock moves immediately (no approval).'}</div><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={save.isPending || !v.lines.length} onClick={submit}>{save.isPending && <Spinner />} Transfer</button></>}>
      <DocHeader v={v} set={set} usedFor="stock_transfer" errors={errors} firmLabel="From Firm" branchLabel="From Branch" extra={<>
        <Field label="To Firm" required error={errors.toFirmId}><Select value={v.toFirmId} onChange={(x) => { set('toFirmId', x); set('toBranchId', ''); }} options={(firms.data ?? []).map((f) => ({ value: f.id, label: f.name }))} /></Field>
        <Field label="To Branch" required error={errors.toBranchId}><Select value={v.toBranchId} onChange={(x) => set('toBranchId', x)} options={(toBranches.data ?? []).filter((b) => !(b.id === v.branchId)).map((b) => ({ value: b.id, label: b.name }))} /></Field>
        <Field label="Notes"><TextArea rows={1} value={v.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </>} />
      <div className="mt-4"><label className="label">Add product</label><ItemPicker value={null} onChange={add} firmId={v.firmId} branchId={v.branchId} exclude={v.lines.map((l: any) => l.item.id)} placeholder="Search product / SKU to add a line" /></div>
      {errors.lines && <p className="mt-1 text-[12px] text-red-600">{errors.lines}</p>}
      <LinesTable head={['Product', 'Available', 'Qty', 'Unit Price', 'Total', '']} empty={!v.lines.length}>
        {v.lines.map((l: any, i: number) => (
          <tr key={l.item.id}>
            <td className="px-3 py-1.5"><div className="font-medium text-gray-900">{l.item.name}</div><div className="font-mono text-[11px] text-gray-500">{l.item.sku}</div></td>
            <td className="px-3 py-1.5 text-right">{fmtNum(l.item.saleable, 3)}</td>
            <td className="px-3 py-1.5 text-right"><input autoFocus type="number" step="any" min={0} className={cx('input input-sm w-[110px] text-right', (errors[`lines.${i}.qty`] || Number(l.qty) > l.item.saleable) && 'border-red-400')} value={l.qty} onChange={(e) => upd(i, 'qty', e.target.value)} /></td>
            <td className="px-3 py-1.5 text-right"><input type="number" step="any" min={0} className="input input-sm w-[110px] text-right" placeholder="FIFO cost" value={l.rate} onChange={(e) => upd(i, 'rate', e.target.value)} /></td>
            <td className="px-3 py-1.5 text-right">{l.rate ? fmtMoney(Number(l.qty || 0) * Number(l.rate)) : <span className="text-gray-400">at cost</span>}</td>
            <td className="px-3 py-1.5 text-right"><button className="icon-btn h-7 w-7 text-red-600" onClick={() => set('lines', v.lines.filter((_: any, j: number) => j !== i))}><X className="h-3.5 w-3.5" /></button></td>
          </tr>
        ))}
      </LinesTable>
    </Modal>
  );
}

export function StockTransfersPage() {
  const [state, setState] = useListState({ sortBy: 'transferDate' });
  const q = useList<any>('transfers', '/api/accounting/inventory/transfers', state);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  const can = useAuthStore((s) => s.can);
  const remove = useSave({ invalidate: ['transfers', 'stock-view'], onSuccess: () => setDel(null) });
  const act = useSave({ invalidate: ['transfers', 'stock-view'] });
  const columns: Column<any>[] = [
    { key: 'number', header: 'Number', locked: true, render: (r) => <span className="font-mono font-medium text-primary">{r.number}</span> },
    { key: 'transferDate', header: 'Date', render: (r) => fmtDate(r.transferDate) },
    { key: 'fromLabel', header: 'From', sortable: false },
    { key: 'toLabel', header: 'To', sortable: false, render: (r) => <span className="inline-flex items-center gap-1"><ArrowRight className="h-3.5 w-3.5 text-gray-400" />{r.toLabel}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge s={r.status} /> },
    { key: 'referenceNo', header: 'Reference', hidden: true, render: (r) => r.referenceNo || '-' },
    { key: 'lines', header: 'Items', align: 'right', sortable: false, render: (r) => r.lines?.length ?? 0 },
    { key: 'totalValue', header: 'Value', align: 'right', render: (r) => fmtMoney(r.totalValue) },
    { key: 'createdByName', header: 'Created By', hidden: true },
  ];
  const filterFields: FilterFieldDef[] = [{ key: 'number', label: 'Number' }, { key: 'transferDate', label: 'Date', type: 'date' }, { key: 'status', label: 'Status', type: 'select', options: ['pending', 'completed', 'rejected'].map((s) => ({ value: s, label: s })) }, { key: 'referenceNo', label: 'Reference' }, { key: 'totalValue', label: 'Value', type: 'number' }];
  return (
    <>
      <h2 className="mb-3 text-[20px] font-semibold text-gray-900">Stock Transfers</h2>
      <DataTable storageKey="transfers" filterFields={filterFields} columns={columns} rows={q.data?.rows ?? []} total={q.data?.total} loading={q.isFetching} state={state} onStateChange={setState} rowKey={(r) => r.id} onRefresh={() => q.refetch()} onRowClick={setView}
        actions={can('acc_stock_transfer', 'create') && <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add</button>}
        rowActions={(r) => (<span className="inline-flex gap-1">
          {r.status === 'pending' && can('acc_stock_transfer', 'update') && (<><button className="icon-btn h-7 w-7 text-green-700" title="Approve" onClick={() => act.mutate({ method: 'post', url: `/api/accounting/inventory/transfers/${r.id}/approve` })}><Check className="h-3.5 w-3.5" /></button><button className="icon-btn h-7 w-7 text-amber-700" title="Reject" onClick={() => act.mutate({ method: 'post', url: `/api/accounting/inventory/transfers/${r.id}/reject` })}><X className="h-3.5 w-3.5" /></button></>)}
          <button className="icon-btn h-7 w-7" onClick={() => setView(r)}><Eye className="h-3.5 w-3.5" /></button>
          {can('acc_stock_transfer', 'delete') && <button className="icon-btn h-7 w-7 text-red-600" onClick={() => setDel(r)}><Trash2 className="h-3.5 w-3.5" /></button>}
        </span>)}
        emptyTitle="No transfers" emptyDescription="Move stock between branches or firms. Value carries at FIFO cost unless you set a unit price." />
      <TransferForm open={open} onClose={() => setOpen(false)} />
      <DocDetail doc={view} onClose={() => setView(null)} title="Transfer" head={['Product', 'Qty', 'Unit Price', 'Total']} lines={(l) => [<><div className="font-medium text-gray-900">{l.itemName}</div><div className="font-mono text-[11px] text-gray-500">{l.sku}</div></>, fmtNum(l.qty, 3), fmtMoney(l.unitPrice), fmtMoney(l.total)]} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} loading={remove.isPending} title="Delete transfer?" message={<>Delete <b>{del?.number}</b>? Stock at both branches will be reversed.</>} onConfirm={() => del && remove.mutate({ method: 'delete', url: `/api/accounting/inventory/transfers/${del.id}` })} />
    </>
  );
}

/* ======================= Item transfer (product → product) ======================= */
const itInit = () => ({ firmId: '', branchId: '', seriesId: '', number: '', referenceNo: '', date: today(), notes: '', lines: [] as { from: ItemOption; to: ItemOption | null; qty: string; rate: string }[] });

function ItemTransferForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [v, set, setV] = useDoc(itInit());
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (open) { setV(itInit()); setErrors({}); } }, [open]); // eslint-disable-line
  const save = useSave({ invalidate: ['item-transfers', 'stock-view', 'items-lookup'], onSuccess: onClose });
  const add = (it: ItemOption | null) => it && set('lines', [...v.lines, { from: it, to: null, qty: '', rate: '' }]);
  const upd = (i: number, k: string, val: any) => set('lines', v.lines.map((l: any, j: number) => (j === i ? { ...l, [k]: val } : l)));
  const ready = v.lines.length > 0 && v.lines.every((l: any) => l.to && Number(l.qty) > 0);
  const submit = () => save.mutate({ method: 'post', url: '/api/accounting/inventory/item-transfers', body: { firmId: v.firmId, branchId: v.branchId, seriesId: v.seriesId || null, number: v.number || null, transferDate: v.date, referenceNo: v.referenceNo || null, notes: v.notes || null, lines: v.lines.map((l: any) => ({ fromItemId: l.from.id, toItemId: l.to.id, qty: Number(l.qty), unitPrice: Number(l.rate || 0) })) } }, { onError: (e) => setErrors(errMap(e)) });
  return (
    <Modal open={open} onClose={onClose} size="xl" title="New Product Transfer" footer={<><div className="mr-auto text-[12px] text-gray-500">Converts stock from one sub-product into another (e.g. rough → polished, loose → set).</div><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={save.isPending || !ready} onClick={submit}>{save.isPending && <Spinner />} Transfer</button></>}>
      <DocHeader v={v} set={set} usedFor="item_transfer" errors={errors} extra={<Field label="Notes" className="sm:col-span-3"><TextArea rows={1} value={v.notes} onChange={(e) => set('notes', e.target.value)} /></Field>} />
      <div className="mt-4"><label className="label">From product</label><ItemPicker value={null} onChange={add} firmId={v.firmId} branchId={v.branchId} placeholder="Search the source product / SKU" /></div>
      {errors.lines && <p className="mt-1 text-[12px] text-red-600">{errors.lines}</p>}
      <LinesTable head={['From', 'To', 'Available', 'Qty', 'Unit Price', '']} empty={!v.lines.length}>
        {v.lines.map((l: any, i: number) => (
          <tr key={i}>
            <td className="px-3 py-1.5"><div className="font-medium text-gray-900">{l.from.name}</div><div className="font-mono text-[11px] text-gray-500">{l.from.sku}</div></td>
            <td className="px-3 py-1.5 !text-left"><div className="min-w-[240px]"><ItemPicker size="sm" value={l.to} onChange={(it) => upd(i, 'to', it)} firmId={v.firmId} branchId={v.branchId} exclude={[l.from.id]} placeholder="Destination product" /></div></td>
            <td className="px-3 py-1.5 text-right">{fmtNum(l.from.saleable, 3)}</td>
            <td className="px-3 py-1.5 text-right"><input type="number" step="any" min={0} className={cx('input input-sm w-[100px] text-right', Number(l.qty) > l.from.saleable && 'border-red-400')} value={l.qty} onChange={(e) => upd(i, 'qty', e.target.value)} /></td>
            <td className="px-3 py-1.5 text-right"><input type="number" step="any" min={0} className="input input-sm w-[110px] text-right" placeholder="FIFO cost" value={l.rate} onChange={(e) => upd(i, 'rate', e.target.value)} /></td>
            <td className="px-3 py-1.5 text-right"><button className="icon-btn h-7 w-7 text-red-600" onClick={() => set('lines', v.lines.filter((_: any, j: number) => j !== i))}><X className="h-3.5 w-3.5" /></button></td>
          </tr>
        ))}
      </LinesTable>
    </Modal>
  );
}

export function ItemTransfersPage() {
  const [state, setState] = useListState({ sortBy: 'transferDate' });
  const q = useList<any>('item-transfers', '/api/accounting/inventory/item-transfers', state);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  const can = useAuthStore((s) => s.can);
  const remove = useSave({ invalidate: ['item-transfers', 'stock-view'], onSuccess: () => setDel(null) });
  const columns: Column<any>[] = [
    { key: 'number', header: 'Number', locked: true, render: (r) => <span className="font-mono font-medium text-primary">{r.number}</span> },
    { key: 'transferDate', header: 'Date', render: (r) => fmtDate(r.transferDate) },
    { key: 'lines', header: 'Conversions', sortable: false, render: (r) => (r.lines ?? []).slice(0, 2).map((l: any, i: number) => <div key={i} className="text-[12px]">{l.fromName} <ArrowRight className="inline h-3 w-3 text-gray-400" /> {l.toName} <span className="text-gray-500">× {fmtNum(l.qty, 3)}</span></div>).concat(r.lines?.length > 2 ? [<div key="m" className="text-[11px] text-gray-500">+{r.lines.length - 2} more</div>] : []) },
    { key: 'referenceNo', header: 'Reference', hidden: true, render: (r) => r.referenceNo || '-' },
    { key: 'totalValue', header: 'Value', align: 'right', render: (r) => fmtMoney(r.totalValue) },
    { key: 'notes', header: 'Notes', hidden: true, render: (r) => r.notes || '-' },
  ];
  const filterFields: FilterFieldDef[] = [{ key: 'number', label: 'Number' }, { key: 'transferDate', label: 'Date', type: 'date' }, { key: 'referenceNo', label: 'Reference' }, { key: 'totalValue', label: 'Value', type: 'number' }];
  return (
    <>
      <h2 className="mb-3 text-[20px] font-semibold text-gray-900">Product Transfers</h2>
      <DataTable storageKey="item-transfers" filterFields={filterFields} columns={columns} rows={q.data?.rows ?? []} total={q.data?.total} loading={q.isFetching} state={state} onStateChange={setState} rowKey={(r) => r.id} onRefresh={() => q.refetch()} onRowClick={setView}
        actions={can('acc_item_transfer', 'create') && <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add</button>}
        rowActions={(r) => <span className="inline-flex gap-1"><button className="icon-btn h-7 w-7" onClick={() => setView(r)}><Eye className="h-3.5 w-3.5" /></button>{can('acc_item_transfer', 'delete') && <button className="icon-btn h-7 w-7 text-red-600" onClick={() => setDel(r)}><Trash2 className="h-3.5 w-3.5" /></button>}</span>}
        emptyTitle="No product transfers" emptyDescription="Convert quantity from one sub-product to another within a branch." />
      <ItemTransferForm open={open} onClose={() => setOpen(false)} />
      <DocDetail doc={view} onClose={() => setView(null)} title="Product Transfer" head={['From → To', 'Qty', 'Unit Price', 'Total']} lines={(l) => [<>{l.fromName} <ArrowRight className="inline h-3 w-3 text-gray-400" /> {l.toName}</>, fmtNum(l.qty, 3), fmtMoney(l.unitPrice), fmtMoney(l.total)]} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} loading={remove.isPending} title="Delete product transfer?" message={<>Delete <b>{del?.number}</b>? Both stock movements will be reversed.</>} onConfirm={() => del && remove.mutate({ method: 'delete', url: `/api/accounting/inventory/item-transfers/${del.id}` })} />
    </>
  );
}
