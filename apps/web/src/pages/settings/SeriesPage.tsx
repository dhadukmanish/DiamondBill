import { Fragment, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { SERIES_USED_FOR, SERIES_USED_FOR_LABELS, SERIES_TYPES } from '@diamondbill/shared';
import { DataTable, useListState, type Column } from '@/components/data/DataTable';
import { Badge, Checkbox, ConfirmDialog, Field, Modal, Select, Spinner, Switch, TextInput } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { applyApiErrors, useBranches, useFirms, useFiscalYears, useList, useSave } from '@/lib/queries';
import { useAuthStore } from '@/store/auth';

const usedForOpts = SERIES_USED_FOR.map((u) => ({ value: u, label: SERIES_USED_FOR_LABELS[u] }));
const typeOpts = SERIES_TYPES.map((t) => ({ value: t, label: t === 'regulated' ? 'Regulated' : 'Unregulated' }));

function preview(prefix: string, postfix: string, pad: number, n = 1) {
  return `${prefix ?? ''}${String(n).padStart(Number(pad) || 1, '0')}${postfix ?? ''}`;
}

/* ---------- Single add/edit ---------- */
function SeriesForm({ open, onClose, row, firmId }: { open: boolean; onClose: () => void; row?: any | null; firmId: string }) {
  const firms = useFirms();
  const { register, handleSubmit, control, reset, watch, setError, formState: { errors } } = useForm<any>({ defaultValues: { firmId, branchId: '', fiscalYearId: '', usedFor: 'invoice', seriesType: 'regulated', prefix: '', postfix: '', paddingLength: 1, isDefault: false } });
  const fId = watch('firmId');
  const branches = useBranches(fId);
  const fys = useFiscalYears(fId);
  useEffect(() => { if (open) reset(row ? { firmId: row.firmId, branchId: row.branchId ?? '', fiscalYearId: row.fiscalYearId, usedFor: row.usedFor, seriesType: row.seriesType, prefix: row.prefix, postfix: row.postfix, paddingLength: row.paddingLength, isDefault: row.isDefault } : { firmId, branchId: '', fiscalYearId: '', usedFor: 'invoice', seriesType: 'regulated', prefix: '', postfix: '', paddingLength: 1, isDefault: false }); }, [open, row]); // eslint-disable-line
  useEffect(() => { if (!row && fys.data?.length && !watch('fiscalYearId')) reset((v: any) => ({ ...v, fiscalYearId: fys.data!.find((f) => f.isActive)?.id ?? fys.data![0].id })); }, [fys.data]); // eslint-disable-line
  const save = useSave({ invalidate: ['series'], onSuccess: onClose });
  const submit = handleSubmit((v) => save.mutate({ method: row ? 'put' : 'post', url: row ? `/api/crm/master/series/${row.id}` : '/api/crm/master/series', body: { ...v, branchId: v.branchId || null, paddingLength: Number(v.paddingLength) } }, { onError: (e) => applyApiErrors(e, setError as any) }));
  const [p, s, pad] = [watch('prefix'), watch('postfix'), watch('paddingLength')];
  return (
    <Modal open={open} onClose={onClose} title={row ? 'Edit Series' : 'Add Series'} size="lg" footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending && <Spinner />} {row ? 'Update' : 'Save'}</button></>}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Firm" required error={errors.firmId?.message as string}><Controller control={control} name="firmId" rules={{ required: 'Required' }} render={({ field }) => <Select value={field.value} onChange={field.onChange} options={(firms.data ?? []).map((f) => ({ value: f.id, label: f.name }))} />} /></Field>
        <Field label="Branch" hint="Leave blank for all branches"><Controller control={control} name="branchId" render={({ field }) => <Select value={field.value} onChange={field.onChange} placeholder="All Branches" options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />} /></Field>
        <Field label="Financial Year" required error={errors.fiscalYearId?.message as string}><Controller control={control} name="fiscalYearId" rules={{ required: 'Required' }} render={({ field }) => <Select value={field.value} onChange={field.onChange} options={(fys.data ?? []).map((f) => ({ value: f.id, label: f.name }))} />} /></Field>
        <Field label="Used For" required><Controller control={control} name="usedFor" render={({ field }) => <Select value={field.value} onChange={field.onChange} options={usedForOpts} />} /></Field>
        <Field label="Series Type" required><Controller control={control} name="seriesType" render={({ field }) => <Select value={field.value} onChange={field.onChange} options={typeOpts} />} /></Field>
        <Field label="Padding Length" hint="Minimum digits, e.g. 4 → 0001"><TextInput type="number" min={1} max={10} {...register('paddingLength')} /></Field>
        <Field label="Prefix" error={errors.prefix?.message as string}><TextInput {...register('prefix')} placeholder="IP-26/27-" /></Field>
        <Field label="Postfix" error={errors.postfix?.message as string}><TextInput {...register('postfix')} /></Field>
        <div className="sm:col-span-2 flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
          <div className="text-[13px] text-gray-500">Preview: <span className="font-mono font-medium text-gray-900">{preview(p, s, pad)}</span></div>
          <Controller control={control} name="isDefault" render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label="Set as default" />} />
        </div>
      </form>
    </Modal>
  );
}

/* ---------- Add Multiple (grid with auto-fill) ---------- */
function BulkForm({ open, onClose, firmId }: { open: boolean; onClose: () => void; firmId: string }) {
  const firms = useFirms();
  const [fId, setFId] = useState(firmId);
  const [branchId, setBranchId] = useState('');
  const [fyId, setFyId] = useState('');
  const branches = useBranches(fId);
  const fys = useFiscalYears(fId);
  useEffect(() => { if (fys.data?.length && !fyId) setFyId(fys.data.find((f) => f.isActive)?.id ?? fys.data[0].id); }, [fys.data]); // eslint-disable-line
  const defaults = useQuery({ queryKey: ['series-defaults', fyId], queryFn: () => api.get<any[]>(`/api/crm/master/series/defaults${qs({ fiscalYearId: fyId })}`), enabled: open && !!fyId });
  const [rows, setRows] = useState<any[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  useEffect(() => { if (defaults.data) { setRows(defaults.data); setSelected(Object.fromEntries(defaults.data.map((r) => [r.usedFor, true]))); } }, [defaults.data]);
  const save = useSave({ invalidate: ['series'], onSuccess: onClose });
  const upd = (i: number, type: 'regulated' | 'unregulated', k: string, v: any) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [type]: { ...r[type], [k]: v } } : r)));
  const submit = () => save.mutate({ method: 'post', url: '/api/crm/master/series/bulk', body: { firmId: fId, branchId: branchId || null, fiscalYearId: fyId, rows: rows.filter((r) => selected[r.usedFor]).map((r) => ({ usedFor: r.usedFor, regulated: { ...r.regulated, paddingLength: Number(r.regulated.paddingLength) || 1 }, unregulated: { ...r.unregulated, paddingLength: Number(r.unregulated.paddingLength) || 1 } })) } });
  const allSel = rows.length > 0 && rows.every((r) => selected[r.usedFor]);
  return (
    <Modal open={open} onClose={onClose} title="Add Multiple Series" size="full" footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={save.isPending || !fyId}>{save.isPending && <Spinner />} Save {Object.values(selected).filter(Boolean).length} Series</button></>}>
      <div className="grid gap-4 sm:grid-cols-3 mb-4">
        <Field label="Firm" required><Select value={fId} onChange={(v) => { setFId(v); setFyId(''); setBranchId(''); }} options={(firms.data ?? []).map((f) => ({ value: f.id, label: f.name }))} /></Field>
        <Field label="Branch"><Select value={branchId} onChange={setBranchId} placeholder="All Branches" options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} /></Field>
        <Field label="Financial Year" required><Select value={fyId} onChange={setFyId} options={(fys.data ?? []).map((f) => ({ value: f.id, label: f.name }))} /></Field>
      </div>
      <p className="mb-3 text-[13px] text-gray-500">Prefixes are auto-filled as <span className="font-mono">&lt;CODE&gt;P-26/27-</span> (Regulated) and <span className="font-mono">&lt;CODE&gt;K-26/27-</span> (Unregulated). Edit any cell before saving.</p>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="min-w-full">
          <thead className="bg-[#F8FAFC]">
            <tr>
              <th className="table-head w-10 !px-3"><Checkbox checked={allSel} onChange={(v) => setSelected(Object.fromEntries(rows.map((r) => [r.usedFor, v])))} /></th>
              <th className="table-head">Used For</th>
              <th className="table-head" colSpan={4}><span className="text-primary">Regulated</span> — Prefix / Postfix / Padding / Preview</th>
              <th className="table-head" colSpan={4}><span className="text-amber-700">Unregulated</span> — Prefix / Postfix / Padding / Preview</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {defaults.isLoading && <tr><td colSpan={10} className="py-8 text-center"><Spinner className="inline" /></td></tr>}
            {rows.map((r, i) => (
              <tr key={r.usedFor} className={!selected[r.usedFor] ? 'opacity-50' : ''}>
                <td className="table-cell !px-3 !py-1.5"><Checkbox checked={!!selected[r.usedFor]} onChange={(v) => setSelected((s) => ({ ...s, [r.usedFor]: v }))} /></td>
                <td className="table-cell !py-1.5 font-medium text-gray-900">{SERIES_USED_FOR_LABELS[r.usedFor as keyof typeof SERIES_USED_FOR_LABELS]}</td>
                {(['regulated', 'unregulated'] as const).map((t) => (
                  <Fragment key={t}>
                    <td key={t + 'p'} className="table-cell !py-1.5 !px-2"><TextInput size="sm" value={r[t].prefix} onChange={(e) => upd(i, t, 'prefix', e.target.value)} className="w-[130px]" /></td>
                    <td key={t + 's'} className="table-cell !py-1.5 !px-2"><TextInput size="sm" value={r[t].postfix} onChange={(e) => upd(i, t, 'postfix', e.target.value)} className="w-[90px]" /></td>
                    <td key={t + 'n'} className="table-cell !py-1.5 !px-2"><TextInput size="sm" type="number" min={1} value={r[t].paddingLength} onChange={(e) => upd(i, t, 'paddingLength', e.target.value)} className="w-[64px]" /></td>
                    <td key={t + 'v'} className="table-cell !py-1.5 !px-2 font-mono text-[12px] text-gray-500">{preview(r[t].prefix, r[t].postfix, r[t].paddingLength)}</td>
                  </Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

export default function SeriesPage() {
  const [state, setState] = useListState({ limit: 500, sortOrder: 'asc' });
  const firms = useFirms();
  const [firmId, setFirmId] = useState('');
  const [usedFor, setUsedFor] = useState('');
  const effectiveFirm = firmId || firms.data?.find((f) => f.isDefault)?.id || '';
  const q = useList<any>('series', '/api/crm/master/series', state, { firmId, usedFor });
  const [edit, setEdit] = useState<any | null | undefined>(undefined);
  const [bulk, setBulk] = useState(false);
  const [del, setDel] = useState<any | null>(null);
  const can = useAuthStore((s) => s.can);
  const remove = useSave({ invalidate: ['series'], onSuccess: () => setDel(null) });
  const columns = useMemo<Column<any>[]>(() => [
    { key: 'usedFor', header: 'Used For', locked: true, render: (r) => <span className="font-medium text-gray-900">{SERIES_USED_FOR_LABELS[r.usedFor as keyof typeof SERIES_USED_FOR_LABELS] ?? r.usedFor}</span> },
    { key: 'seriesType', header: 'Type', render: (r) => (r.seriesType === 'regulated' ? <Badge color="blue">Regulated</Badge> : <Badge color="amber">Unregulated</Badge>) },
    { key: 'format', header: 'Series Format', render: (r) => <span className="font-mono">{r.format}</span> },
    { key: 'preview', header: 'Next Number', render: (r) => <span className="font-mono">{r.preview}</span> },
    { key: 'fiscalYearName', header: 'Financial Year' },
    { key: 'branchName', header: 'Branch', render: (r) => r.branchName ?? 'All' },
    { key: 'firmName', header: 'Firm', hidden: true },
    { key: 'isDefault', header: 'Default', render: (r) => (r.isDefault ? <Badge color="green">Default</Badge> : '') },
  ], []);
  return (
    <>
      <h2 className="mb-4 text-[20px] font-semibold text-gray-900">Series</h2>
      <DataTable storageKey="series" clientSide hidePagination columns={columns} rows={q.data?.rows ?? []} loading={q.isFetching} state={state} onStateChange={setState} rowKey={(r) => r.id} onRefresh={() => q.refetch()}
        toolbar={<><Select size="sm" className="w-[190px]" value={firmId} onChange={setFirmId} placeholder="All Firms" options={(firms.data ?? []).map((f) => ({ value: f.id, label: f.name }))} /><Select size="sm" className="w-[190px]" value={usedFor} onChange={setUsedFor} placeholder="All Used For" options={usedForOpts} /></>}
        actions={can('crm_series', 'create') && (<><button className="btn-outline-primary" onClick={() => setBulk(true)}><Layers className="h-4 w-4" /> Add Multiple</button><button className="btn-primary" onClick={() => setEdit(null)}><Plus className="h-4 w-4" /> Add Series</button></>)}
        rowActions={(r) => (<span className="inline-flex gap-1"><button className="icon-btn h-7 w-7" onClick={() => setEdit(r)}><Pencil className="h-3.5 w-3.5" /></button><button className="icon-btn h-7 w-7 text-red-600" onClick={() => setDel(r)}><Trash2 className="h-3.5 w-3.5" /></button></span>)}
        emptyTitle="No series yet" emptyDescription="Use “Add Multiple” to create the full set of numbering series for a financial year in one go." />
      <SeriesForm open={edit !== undefined} onClose={() => setEdit(undefined)} row={edit} firmId={effectiveFirm} />
      {bulk && <BulkForm open={bulk} onClose={() => setBulk(false)} firmId={effectiveFirm} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} loading={remove.isPending} title="Delete series?" message={<>Delete series <b>{del?.format}</b>?</>} onConfirm={() => del && remove.mutate({ method: 'delete', url: `/api/crm/master/series/${del.id}` })} />
    </>
  );
}
