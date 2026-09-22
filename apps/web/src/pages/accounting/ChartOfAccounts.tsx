import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Lock, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, ACCOUNT_SUB_TYPES, type AccountType } from '@diamondbill/shared';
import { Badge, Checkbox, ConfirmDialog, Field, Modal, Select, Spinner, Tabs, TextArea, TextInput } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { applyApiErrors, useFirms, useSave } from '@/lib/queries';
import { useAuthStore } from '@/store/auth';
import { cx, fmtMoney } from '@/lib/format';

type Acc = any;
const defaults = { name: '', accountType: 'asset' as AccountType, accountSubType: '', parentId: '', description: '', isGroup: false, isActive: true, bankName: '', accountNo: '', ifscCode: '', bankBranch: '' };

function AccountForm({ open, onClose, row, tree, initialType }: { open: boolean; onClose: () => void; row?: Acc | null; tree: Acc[]; initialType?: AccountType }) {
  const { register, handleSubmit, control, reset, watch, setValue, setError, formState: { errors } } = useForm<typeof defaults>({ defaultValues: defaults });
  useEffect(() => { if (open) reset(row ? { ...defaults, ...row, parentId: row.parentId ?? '', description: row.description ?? '', bankName: row.bankName ?? '', accountNo: row.accountNo ?? '', ifscCode: row.ifscCode ?? '', bankBranch: row.bankBranch ?? '' } : { ...defaults, accountType: initialType ?? 'asset', accountSubType: ACCOUNT_SUB_TYPES[initialType ?? 'asset'][0].value }); }, [open, row, initialType, reset]);
  const type = watch('accountType');
  const sub = watch('accountSubType');
  useEffect(() => { if (!row && !ACCOUNT_SUB_TYPES[type].some((s) => s.value === sub)) setValue('accountSubType', ACCOUNT_SUB_TYPES[type][0].value); }, [type]); // eslint-disable-line
  const flat = useMemo(() => { const out: Acc[] = []; const walk = (n: Acc[], d: number) => n.forEach((a) => { out.push({ ...a, depth: d }); walk(a.children ?? [], d + 1); }); walk(tree, 0); return out; }, [tree]);
  const parents = flat.filter((a) => a.accountType === type && a.id !== row?.id);
  const save = useSave({ invalidate: ['coa'], onSuccess: onClose });
  const submit = handleSubmit((v) => save.mutate({ method: row ? 'put' : 'post', url: row ? `/api/accounting/chart-of-accounts/${row.id}` : '/api/accounting/chart-of-accounts', body: { ...v, parentId: v.parentId || null, description: v.description || null } }, { onError: (e) => applyApiErrors(e, setError as any) }));
  const isBank = sub === 'bank' || sub === 'credit_card';
  return (
    <Modal open={open} onClose={onClose} title={row ? 'Edit Account' : 'Add Account'} size="md" footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending && <Spinner />} {row ? 'Update' : 'Save'}</button></>}>
      <form onSubmit={submit} className="space-y-4">
        {row?.isSystem && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800 flex items-center gap-2"><Lock className="h-3.5 w-3.5" /> System account — only name, description and bank details can be changed.</p>}
        <Field label="Account Type" required><Controller control={control} name="accountType" render={({ field }) => <Select value={field.value} onChange={field.onChange} disabled={row?.isSystem} options={ACCOUNT_TYPES.map((t) => ({ value: t, label: ACCOUNT_TYPE_LABELS[t] }))} />} /></Field>
        <Field label="Account Sub Type" required><Controller control={control} name="accountSubType" render={({ field }) => <Select value={field.value} onChange={field.onChange} disabled={row?.isSystem} options={ACCOUNT_SUB_TYPES[type].map((s) => ({ value: s.value, label: s.label }))} />} /></Field>
        <Field label="Account Name" required error={errors.name?.message}><TextInput {...register('name', { required: 'Required' })} /></Field>
        <Field label="Parent Account" hint="Optional — nest this account under a group"><Controller control={control} name="parentId" render={({ field }) => <Select value={field.value} onChange={field.onChange} placeholder="None (top level)" options={parents.map((p) => ({ value: p.id, label: `${'  '.repeat(p.depth)}${p.name}` }))} />} /></Field>
        {!row?.isSystem && <Controller control={control} name="isGroup" render={({ field }) => <Checkbox checked={field.value} onChange={field.onChange} label="This is a group account (cannot be posted to)" />} />}
        {isBank && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-line p-3">
            <Field label="Bank Name"><TextInput {...register('bankName')} /></Field>
            <Field label="Account No"><TextInput {...register('accountNo')} /></Field>
            <Field label="IFSC"><TextInput {...register('ifscCode')} /></Field>
            <Field label="Branch"><TextInput {...register('bankBranch')} /></Field>
          </div>
        )}
        <Field label="Description"><TextArea {...register('description')} /></Field>
      </form>
    </Modal>
  );
}

function Row({ a, depth, expanded, toggle, onEdit, onDelete, canEdit }: { a: Acc; depth: number; expanded: Set<string>; toggle: (id: string) => void; onEdit: (a: Acc) => void; onDelete: (a: Acc) => void; canEdit: boolean }) {
  const has = a.children?.length > 0;
  const open = expanded.has(a.id);
  return (
    <>
      <tr className="hover:bg-gray-50/70 group">
        <td className="table-cell !py-2" style={{ paddingLeft: 20 + depth * 22 }}>
          <span className="inline-flex items-center gap-1.5">
            {has ? <button onClick={() => toggle(a.id)} className="text-gray-400 hover:text-gray-700">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button> : <span className="inline-block w-4" />}
            <span className={cx(a.isGroup || has ? 'font-semibold text-gray-900' : 'text-gray-800')}>{a.name}</span>
            {a.isSystem && <Lock className="h-3 w-3 text-gray-300" />}
            {!a.isActive && <Badge color="red">Inactive</Badge>}
          </span>
        </td>
        <td className="table-cell !py-2 text-gray-500">{a.subTypeLabel}</td>
        <td className="table-cell !py-2 text-right font-mono">{fmtMoney(a.balance)}</td>
        <td className="table-cell !py-2 text-right">
          {canEdit && (
            <span className="inline-flex gap-1 opacity-0 group-hover:opacity-100 transition">
              <button className="icon-btn h-7 w-7" onClick={() => onEdit(a)}><Pencil className="h-3.5 w-3.5" /></button>
              {!a.isSystem && <button className="icon-btn h-7 w-7 text-red-600" onClick={() => onDelete(a)}><Trash2 className="h-3.5 w-3.5" /></button>}
            </span>
          )}
        </td>
      </tr>
      {has && open && a.children.map((c: Acc) => <Row key={c.id} a={c} depth={depth + 1} expanded={expanded} toggle={toggle} onEdit={onEdit} onDelete={onDelete} canEdit={canEdit} />)}
    </>
  );
}

export default function ChartOfAccounts() {
  const firms = useFirms();
  const [firmId, setFirmId] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<string>('all');
  const q = useQuery({ queryKey: ['coa', firmId, search], queryFn: () => api.get<Acc[]>(`/api/accounting/chart-of-accounts/tree${qs({ firmId, search })}`) });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => { if (q.data && (search || expanded.size === 0)) setExpanded(new Set(q.data.map((a) => a.id))); }, [q.data]); // eslint-disable-line
  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [edit, setEdit] = useState<Acc | null | undefined>(undefined);
  const [del, setDel] = useState<Acc | null>(null);
  const can = useAuthStore((s) => s.can);
  const remove = useSave({ invalidate: ['coa'], onSuccess: () => setDel(null) });
  const roots = (q.data ?? []).filter((a) => tab === 'all' || a.accountType === tab);
  const countOf = (t: string) => { let n = 0; const walk = (x: Acc[]) => x.forEach((a) => { if (t === 'all' || a.accountType === t) n++; walk(a.children ?? []); }); walk(q.data ?? []); return n; };
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[20px] font-semibold text-gray-900">Chart of Accounts</h2>
        <div className="flex items-center gap-2">
          <Select size="sm" className="w-[190px]" value={firmId} onChange={setFirmId} placeholder="All Firms" options={(firms.data ?? []).map((f) => ({ value: f.id, label: f.name }))} />
          {can('acc_chart_of_accounts', 'create') && <button className="btn-primary" onClick={() => setEdit(null)}><Plus className="h-4 w-4" /> Add Account</button>}
        </div>
      </div>
      <div className="card">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 pt-3">
          <Tabs value={tab} onChange={setTab} className="flex-1 !border-0" tabs={[{ value: 'all', label: 'All', count: countOf('all') }, ...ACCOUNT_TYPES.map((t) => ({ value: t, label: ACCOUNT_TYPE_LABELS[t], count: countOf(t) }))]} />
          <div className="relative w-[240px] pb-2"><Search className="absolute left-3 top-2 h-4 w-4 text-gray-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search accounts..." className="input input-sm pl-9" /></div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-[#F8FAFC] border-b border-line"><tr><th className="table-head">Account Name</th><th className="table-head">Sub Type</th><th className="table-head text-right">Balance</th><th className="table-head w-20" /></tr></thead>
            <tbody className="divide-y divide-line">
              {q.isLoading && <tr><td colSpan={4} className="py-12 text-center"><Spinner className="inline h-5 w-5" /></td></tr>}
              {roots.map((a) => <Row key={a.id} a={a} depth={0} expanded={expanded} toggle={toggle} onEdit={setEdit} onDelete={setDel} canEdit={can('acc_chart_of_accounts', 'update')} />)}
            </tbody>
          </table>
        </div>
      </div>
      <AccountForm open={edit !== undefined} onClose={() => setEdit(undefined)} row={edit} tree={q.data ?? []} initialType={tab !== 'all' ? (tab as AccountType) : undefined} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} loading={remove.isPending} title="Delete account?" message={<>Delete <b>{del?.name}</b>?</>} onConfirm={() => del && remove.mutate({ method: 'delete', url: `/api/accounting/chart-of-accounts/${del.id}` })} />
    </>
  );
}
