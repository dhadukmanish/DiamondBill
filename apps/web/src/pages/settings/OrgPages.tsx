import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { DataTable, useListState, type Column } from '@/components/data/DataTable';
import { Badge, Combobox, ConfirmDialog, Field, Modal, Select, Spinner, Switch, TextArea, TextInput } from '@/components/ui';
import { applyApiErrors, useCurrencies, useFirms, useList, useSave, useUsersLookup } from '@/lib/queries';
import { useAuthStore } from '@/store/auth';
import { fmtDate } from '@/lib/format';
import { useQueryClient } from '@tanstack/react-query';

/* ============================ Branch ============================ */
export function BranchPage() {
  const [state, setState] = useListState();
  const [firmId, setFirmId] = useState('');
  const firms = useFirms();
  const users = useUsersLookup();
  const q = useList<any>('branches', '/api/organizations/branches', state, { firmId });
  const [edit, setEdit] = useState<any | null | undefined>(undefined);
  const [del, setDel] = useState<any | null>(null);
  const can = useAuthStore((s) => s.can);
  const { register, handleSubmit, control, reset, setError, formState: { errors } } = useForm<any>({ defaultValues: { firmId: '', name: '', address: '', userIds: [] } });
  useEffect(() => { if (edit !== undefined) reset(edit ? { firmId: edit.firmId, name: edit.name, address: edit.address ?? '', userIds: edit.userIds ?? [] } : { firmId: firmId || firms.data?.find((f) => f.isDefault)?.id || '', name: '', address: '', userIds: [] }); }, [edit]); // eslint-disable-line
  const save = useSave({ invalidate: ['branches', 'lookup'], onSuccess: () => setEdit(undefined) });
  const remove = useSave({ invalidate: ['branches', 'lookup'], onSuccess: () => setDel(null) });
  const submit = handleSubmit((v) => save.mutate({ method: edit ? 'put' : 'post', url: edit ? `/api/organizations/branches/${edit.id}` : '/api/organizations/branches', body: v }, { onError: (e) => applyApiErrors(e, setError as any) }));
  const columns: Column<any>[] = [
    { key: 'name', header: 'Branch Name', locked: true, render: (r) => <span className="flex items-center gap-2 font-medium text-gray-900">{r.name}{r.isDefault && <Badge color="blue">Default</Badge>}</span> },
    { key: 'firmName', header: 'Firm' },
    { key: 'address', header: 'Address', render: (r) => r.address || '-' },
    { key: 'users', header: 'Users', render: (r) => (r.userIds?.length ? `${r.userIds.length} user(s)` : '-') },
    { key: 'createdAt', header: 'Created At', render: (r) => fmtDate(r.createdAt, true), hidden: true },
  ];
  return (
    <>
      <h2 className="mb-4 text-[20px] font-semibold text-gray-900">Branch</h2>
      <DataTable storageKey="branches" columns={columns} rows={q.data?.rows ?? []} total={q.data?.total} loading={q.isFetching} state={state} onStateChange={setState} rowKey={(r) => r.id} onRefresh={() => q.refetch()}
        toolbar={<Select size="sm" className="w-[200px]" value={firmId} onChange={setFirmId} placeholder="All Firms" options={(firms.data ?? []).map((f) => ({ value: f.id, label: f.name }))} />}
        actions={can('admin_branches', 'create') && <button className="btn-primary" onClick={() => setEdit(null)}><Plus className="h-4 w-4" /> Add Branch</button>}
        rowActions={(r) => (<span className="inline-flex gap-1"><button className="icon-btn h-7 w-7" onClick={() => setEdit(r)}><Pencil className="h-3.5 w-3.5" /></button>{!r.isDefault && <button className="icon-btn h-7 w-7 text-red-600" onClick={() => setDel(r)}><Trash2 className="h-3.5 w-3.5" /></button>}</span>)} />
      <Modal open={edit !== undefined} onClose={() => setEdit(undefined)} title={edit ? 'Edit Branch' : 'Add Branch'} footer={<><button className="btn-outline" onClick={() => setEdit(undefined)}>Cancel</button><button className="btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending && <Spinner />} {edit ? 'Update' : 'Save'}</button></>}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Firm" required error={errors.firmId?.message as string}><Controller control={control} name="firmId" rules={{ required: 'Firm is required' }} render={({ field }) => <Select value={field.value} onChange={field.onChange} options={(firms.data ?? []).map((f) => ({ value: f.id, label: f.name }))} />} /></Field>
          <Field label="Branch Name" required error={errors.name?.message as string}><TextInput {...register('name', { required: 'Branch name is required' })} /></Field>
          <Field label="Address"><TextArea {...register('address')} /></Field>
          <Field label="Users" hint="Users who can access this branch"><Controller control={control} name="userIds" render={({ field }) => <Combobox multiple value={field.value} onChange={field.onChange} options={(users.data ?? []).map((u) => ({ value: u.id, label: u.name, sub: u.email }))} placeholder="Select users" />} /></Field>
        </form>
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} loading={remove.isPending} title="Delete branch?" message={<>Delete <b>{del?.name}</b>?</>} onConfirm={() => del && remove.mutate({ method: 'delete', url: `/api/organizations/branches/${del.id}` })} />
    </>
  );
}

/* ============================ Financial Year ============================ */
function fyDefaults(start: string) {
  const d = new Date(start);
  const end = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate() - 1);
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { endDate: iso(end), name: `${d.getFullYear()}-${String(end.getFullYear()).slice(2)}` };
}
export function FiscalYearPage() {
  const [state, setState] = useListState();
  const firms = useFirms();
  const q = useList<any>('fiscal-years', '/api/accounting/fiscal-years', state);
  const [edit, setEdit] = useState<any | null | undefined>(undefined);
  const [del, setDel] = useState<any | null>(null);
  const can = useAuthStore((s) => s.can);
  const { register, handleSubmit, control, reset, watch, setValue, setError, formState: { errors } } = useForm<any>({ defaultValues: { firmId: '', name: '', startDate: '', endDate: '', isActive: true } });
  const startDate = watch('startDate');
  useEffect(() => { if (startDate && !edit) { const d = fyDefaults(startDate); setValue('endDate', d.endDate); setValue('name', d.name); } }, [startDate]); // eslint-disable-line
  useEffect(() => { if (edit !== undefined) reset(edit ? { firmId: edit.firmId, name: edit.name, startDate: String(edit.startDate).slice(0, 10), endDate: String(edit.endDate).slice(0, 10), isActive: edit.isActive } : { firmId: firms.data?.find((f) => f.isDefault)?.id || '', name: '', startDate: '', endDate: '', isActive: true }); }, [edit]); // eslint-disable-line
  const save = useSave({ invalidate: ['fiscal-years', 'lookup'], onSuccess: () => setEdit(undefined) });
  const remove = useSave({ invalidate: ['fiscal-years', 'lookup'], onSuccess: () => setDel(null) });
  const submit = handleSubmit((v) => save.mutate({ method: edit ? 'put' : 'post', url: edit ? `/api/accounting/fiscal-years/${edit.id}` : '/api/accounting/fiscal-years', body: v }, { onError: (e) => applyApiErrors(e, setError as any) }));
  const columns: Column<any>[] = [
    { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-gray-900">{r.name}</span> },
    { key: 'firmName', header: 'Firm' },
    { key: 'startDate', header: 'Start Date', render: (r) => fmtDate(r.startDate) },
    { key: 'endDate', header: 'End Date', render: (r) => fmtDate(r.endDate) },
    { key: 'isActive', header: 'Status', render: (r) => (r.isActive ? <Badge color="green">Active</Badge> : <Badge>Inactive</Badge>) },
  ];
  return (
    <>
      <h2 className="mb-4 text-[20px] font-semibold text-gray-900">Financial Year</h2>
      <DataTable storageKey="fy" clientSide columns={columns} rows={q.data?.rows ?? []} loading={q.isFetching} state={state} onStateChange={setState} rowKey={(r) => r.id} onRefresh={() => q.refetch()} hidePagination
        actions={can('admin_financial_year', 'create') && <button className="btn-primary" onClick={() => setEdit(null)}><Plus className="h-4 w-4" /> Add Financial Year</button>}
        rowActions={(r) => (<span className="inline-flex gap-1"><button className="icon-btn h-7 w-7" onClick={() => setEdit(r)}><Pencil className="h-3.5 w-3.5" /></button><button className="icon-btn h-7 w-7 text-red-600" onClick={() => setDel(r)}><Trash2 className="h-3.5 w-3.5" /></button></span>)} />
      <Modal open={edit !== undefined} onClose={() => setEdit(undefined)} title={edit ? 'Edit Financial Year' : 'Add Financial Year'} footer={<><button className="btn-outline" onClick={() => setEdit(undefined)}>Cancel</button><button className="btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending && <Spinner />} {edit ? 'Update' : 'Save'}</button></>}>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Firm" required className="sm:col-span-2" error={errors.firmId?.message as string}><Controller control={control} name="firmId" rules={{ required: 'Firm is required' }} render={({ field }) => <Select value={field.value} onChange={field.onChange} options={(firms.data ?? []).map((f) => ({ value: f.id, label: f.name }))} />} /></Field>
          <Field label="Start Date" required error={errors.startDate?.message as string}><TextInput type="date" {...register('startDate', { required: 'Start date is required' })} /></Field>
          <Field label="End Date" required error={errors.endDate?.message as string}><TextInput type="date" {...register('endDate', { required: 'End date is required' })} /></Field>
          <Field label="Name" required error={errors.name?.message as string}><TextInput {...register('name', { required: 'Name is required' })} placeholder="2026-27" /></Field>
          <Field label="Status"><Controller control={control} name="isActive" render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label={field.value ? 'Active' : 'Inactive'} className="h-10" />} /></Field>
        </form>
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} loading={remove.isPending} title="Delete financial year?" message={<>Delete <b>{del?.name}</b>?</>} onConfirm={() => del && remove.mutate({ method: 'delete', url: `/api/accounting/fiscal-years/${del.id}` })} />
    </>
  );
}

/* ============================ Currencies ============================ */
export function CurrenciesPage() {
  const q = useCurrencies();
  const [cstate, setCstate] = useListState({ sortOrder: 'asc' });
  const qc = useQueryClient();
  const [edit, setEdit] = useState<any | null | undefined>(undefined);
  const [del, setDel] = useState<any | null>(null);
  const can = useAuthStore((s) => s.can);
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<any>({ defaultValues: { code: '', name: '', symbol: '', decimalPlaces: 2 } });
  useEffect(() => { if (edit !== undefined) reset(edit ? { code: edit.code, name: edit.name, symbol: edit.symbol, decimalPlaces: edit.decimalPlaces } : { code: '', name: '', symbol: '', decimalPlaces: 2 }); }, [edit]); // eslint-disable-line
  const save = useSave({ invalidate: ['currencies'], onSuccess: () => { setEdit(undefined); qc.invalidateQueries({ queryKey: ['currencies'] }); } });
  const remove = useSave({ invalidate: ['currencies'], onSuccess: () => setDel(null) });
  const submit = handleSubmit((v) => save.mutate({ method: edit ? 'put' : 'post', url: edit ? `/api/accounting/masters/currencies/${edit.id}` : '/api/accounting/masters/currencies', body: { ...v, code: v.code.toUpperCase(), decimalPlaces: Number(v.decimalPlaces) } }, { onError: (e) => applyApiErrors(e, setError as any) }));
  const columns: Column<any>[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="flex items-center gap-2 font-medium text-gray-900">{r.code}{r.isBaseCurrency && <Badge color="blue">Base Currency</Badge>}</span> },
    { key: 'name', header: 'Currency Name' },
    { key: 'symbol', header: 'Symbol' },
    { key: 'decimalPlaces', header: 'Decimal Places', align: 'right' },
    { key: 'exchangeRate', header: 'Exchange Rate', align: 'right', render: (r) => (r.exchangeRate ?? 1) },
  ];
  return (
    <>
      <h2 className="mb-4 text-[20px] font-semibold text-gray-900">Currencies</h2>
      <DataTable storageKey="currencies" clientSide state={cstate} onStateChange={setCstate} columns={columns} rows={q.data ?? []} loading={q.isFetching} rowKey={(r) => r.id} onRefresh={() => q.refetch()} hidePagination hideSearch
        actions={can('admin_currencies', 'create') && <button className="btn-primary" onClick={() => setEdit(null)}><Plus className="h-4 w-4" /> Add Currency</button>}
        rowActions={(r) => (<span className="inline-flex gap-1"><button className="icon-btn h-7 w-7" onClick={() => setEdit(r)}><Pencil className="h-3.5 w-3.5" /></button>{!r.isBaseCurrency && <button className="icon-btn h-7 w-7 text-red-600" onClick={() => setDel(r)}><Trash2 className="h-3.5 w-3.5" /></button>}</span>)} />
      <Modal open={edit !== undefined} onClose={() => setEdit(undefined)} size="sm" title={edit ? 'Edit Currency' : 'Add Currency'} footer={<><button className="btn-outline" onClick={() => setEdit(undefined)}>Cancel</button><button className="btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending && <Spinner />} {edit ? 'Update' : 'Save'}</button></>}>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Currency Code" required error={errors.code?.message as string}><TextInput {...register('code', { required: 'Required', minLength: { value: 3, message: '3 letters' }, maxLength: { value: 3, message: '3 letters' } })} placeholder="USD" maxLength={3} disabled={!!edit} /></Field>
          <Field label="Symbol" required error={errors.symbol?.message as string}><TextInput {...register('symbol', { required: 'Required' })} placeholder="$" /></Field>
          <Field label="Currency Name" required className="sm:col-span-2" error={errors.name?.message as string}><TextInput {...register('name', { required: 'Required' })} placeholder="US Dollar" /></Field>
          <Field label="Decimal Places"><TextInput type="number" min={0} max={6} {...register('decimalPlaces')} /></Field>
        </form>
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} loading={remove.isPending} title="Delete currency?" message={<>Delete <b>{del?.code}</b>?</>} onConfirm={() => del && remove.mutate({ method: 'delete', url: `/api/accounting/masters/currencies/${del.id}` })} />
    </>
  );
}
