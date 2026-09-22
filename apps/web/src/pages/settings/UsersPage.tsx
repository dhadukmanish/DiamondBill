import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { PERMISSIONS, PERMISSION_ACTIONS, PERMISSION_MODULE_LABELS, type PermissionAction } from '@diamondbill/shared';
import { DataTable, useListState, type Column } from '@/components/data/DataTable';
import { Badge, Checkbox, Combobox, ConfirmDialog, Field, Modal, RadioGroup, Select, Spinner, Switch, Tabs, TextInput } from '@/components/ui';
import { applyApiErrors, useBranches, useFirms, useList, useSave } from '@/lib/queries';
import { useAuthStore } from '@/store/auth';
import { fmtDate, cx } from '@/lib/format';

type Grants = Record<string, PermissionAction[]>;

function PermissionMatrix({ value, onChange }: { value: Grants; onChange: (g: Grants) => void }) {
  const modules = useMemo(() => Object.keys(PERMISSION_MODULE_LABELS) as (keyof typeof PERMISSION_MODULE_LABELS)[], []);
  const [tab, setTab] = useState<string>(modules[0]);
  const [q, setQ] = useState('');
  const list = PERMISSIONS.filter((p) => p.module === tab && (!q || p.displayName.toLowerCase().includes(q.toLowerCase())));
  const has = (n: string, a: PermissionAction) => (value[n] ?? []).includes(a);
  const set = (n: string, a: PermissionAction, v: boolean) => {
    const cur = new Set(value[n] ?? []);
    if (v) { cur.add(a); if (a !== 'read') cur.add('read'); } else { cur.delete(a); if (a === 'read') cur.clear(); }
    onChange({ ...value, [n]: Array.from(cur) });
  };
  const setAll = (a: PermissionAction, v: boolean) => { const g = { ...value }; list.forEach((p) => { const cur = new Set(g[p.name] ?? []); if (v) { cur.add(a); cur.add('read'); } else { cur.delete(a); if (a === 'read') cur.clear(); } g[p.name] = Array.from(cur); }); onChange(g); };
  const setRow = (n: string, v: boolean) => onChange({ ...value, [n]: v ? [...PERMISSION_ACTIONS] : [] });
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onChange={setTab} tabs={modules.map((m) => ({ value: m, label: PERMISSION_MODULE_LABELS[m], count: PERMISSIONS.filter((p) => p.module === m && value[p.name]?.length).length }))} className="flex-1" />
        <TextInput size="sm" placeholder="Search permission..." value={q} onChange={(e) => setQ(e.target.value)} className="w-[200px]" />
      </div>
      <div className="mt-3 overflow-x-auto rounded-lg border border-line max-h-[420px] overflow-y-auto">
        <table className="min-w-full">
          <thead className="bg-[#F8FAFC] sticky top-0">
            <tr>
              <th className="table-head">Permission</th>
              <th className="table-head text-center">All</th>
              {PERMISSION_ACTIONS.map((a) => (
                <th key={a} className="table-head text-center">
                  <span className="inline-flex items-center gap-1.5 capitalize"><Checkbox checked={list.length > 0 && list.every((p) => has(p.name, a))} onChange={(v) => setAll(a, v)} />{a}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((p) => (
              <tr key={p.name} className="hover:bg-gray-50/60">
                <td className="table-cell !py-2">{p.displayName}</td>
                <td className="table-cell !py-2 text-center"><Checkbox checked={PERMISSION_ACTIONS.every((a) => has(p.name, a))} onChange={(v) => setRow(p.name, v)} /></td>
                {PERMISSION_ACTIONS.map((a) => (
                  <td key={a} className="table-cell !py-2 text-center"><Checkbox checked={has(p.name, a)} onChange={(v) => set(p.name, a, v)} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const defaults = { userKind: 'system_user', firstName: '', lastName: '', email: '', mobile: '', role: 'user', password: '', firmIds: [] as string[], branchIds: [] as string[], statementFirmIds: [] as string[], statementBranchIds: [] as string[], contactVisibility: 'all', permissions: {} as Grants, isActive: true };

function UserForm({ open, onClose, row }: { open: boolean; onClose: () => void; row?: any | null }) {
  const firms = useFirms();
  const branches = useBranches();
  const [step, setStep] = useState<'details' | 'permissions'>('details');
  const { register, handleSubmit, control, reset, watch, setError, formState: { errors } } = useForm<typeof defaults>({ defaultValues: defaults });
  useEffect(() => { if (open) { setStep('details'); reset(row ? { ...defaults, ...row, password: '' } : defaults); } }, [open, row, reset]);
  const firmIds = watch('firmIds');
  const role = watch('role');
  const save = useSave({ invalidate: ['users', 'lookup'], onSuccess: onClose });
  const submit = handleSubmit((v) => {
    const body: any = { ...v };
    if (!body.password) delete body.password;
    save.mutate({ method: row ? 'put' : 'post', url: row ? `/api/admin/users/${row.id}` : '/api/admin/users', body }, { onError: (e) => applyApiErrors(e, setError as any) });
  });
  const branchOpts = (branches.data ?? []).filter((b) => firmIds.includes(b.firmId)).map((b) => ({ value: b.id, label: b.name, sub: firms.data?.find((f) => f.id === b.firmId)?.name }));
  return (
    <Modal open={open} onClose={onClose} title={row ? 'Edit User' : 'Add User'} size="xl" footer={<><button className="btn-outline" onClick={onClose}>Cancel</button>{step === 'details' ? <button className="btn-primary" onClick={() => setStep('permissions')}>Next: Permissions</button> : <><button className="btn-outline" onClick={() => setStep('details')}>Back</button><button className="btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending && <Spinner />} {row ? 'Update' : 'Save'}</button></>}</>}>
      <Tabs value={step} onChange={(v) => setStep(v as any)} tabs={[{ value: 'details', label: 'User Details' }, { value: 'permissions', label: 'Permissions' }]} className="mb-5" />
      <form onSubmit={submit} className={cx('grid gap-4 sm:grid-cols-2', step !== 'details' && 'hidden')}>
        <Field label="User Type" className="sm:col-span-2"><Controller control={control} name="userKind" render={({ field }) => <RadioGroup value={field.value} onChange={field.onChange} options={[{ value: 'system_user', label: 'System User' }, { value: 'employee', label: 'Employee' }, { value: 'user_and_employee', label: 'User & Employee' }]} />} /></Field>
        <Field label="First Name" required error={errors.firstName?.message}><TextInput {...register('firstName', { required: 'Required' })} /></Field>
        <Field label="Last Name" required error={errors.lastName?.message}><TextInput {...register('lastName', { required: 'Required' })} /></Field>
        <Field label="Work Email" required error={errors.email?.message}><TextInput type="email" {...register('email', { required: 'Required' })} /></Field>
        <Field label="Mobile Number" required error={errors.mobile?.message}><TextInput {...register('mobile', { required: 'Required' })} /></Field>
        <Field label={row ? 'New Password' : 'Password'} required={!row} error={errors.password?.message} hint={row ? 'Leave blank to keep current password' : 'Minimum 6 characters'}><TextInput type="password" autoComplete="new-password" {...register('password', { required: row ? false : 'Required', minLength: { value: 6, message: 'Minimum 6 characters' } })} /></Field>
        <Field label="Role" required><Controller control={control} name="role" render={({ field }) => <Select value={field.value} onChange={field.onChange} options={[{ value: 'super_admin', label: 'Super Admin (all permissions)' }, { value: 'admin', label: 'Admin' }, { value: 'user', label: 'User' }]} />} /></Field>
        <Field label="Firm Access" required error={(errors.firmIds as any)?.message}><Controller control={control} name="firmIds" rules={{ validate: (v) => v.length > 0 || 'Select at least one firm' }} render={({ field }) => <Combobox multiple value={field.value} onChange={field.onChange} options={(firms.data ?? []).map((f) => ({ value: f.id, label: f.name }))} />} /></Field>
        <Field label="Branch Access" required error={(errors.branchIds as any)?.message}><Controller control={control} name="branchIds" rules={{ validate: (v) => v.length > 0 || 'Select at least one branch' }} render={({ field }) => <Combobox multiple value={field.value} onChange={field.onChange} options={branchOpts} />} /></Field>
        <Field label="Statement Firm Access" hint="Firms whose statements/reports this user can view"><Controller control={control} name="statementFirmIds" render={({ field }) => <Combobox multiple value={field.value} onChange={field.onChange} options={(firms.data ?? []).map((f) => ({ value: f.id, label: f.name }))} />} /></Field>
        <Field label="Statement Branch Access"><Controller control={control} name="statementBranchIds" render={({ field }) => <Combobox multiple value={field.value} onChange={field.onChange} options={branchOpts} />} /></Field>
        <Field label="Contact Visibility" className="sm:col-span-2"><Controller control={control} name="contactVisibility" render={({ field }) => <RadioGroup value={field.value} onChange={field.onChange} options={[{ value: 'all', label: 'All contacts' }, { value: 'sales_person', label: 'Only contacts where user is sales person' }, { value: 'assigned', label: 'Only assigned contacts' }]} />} /></Field>
        <Field label="Status"><Controller control={control} name="isActive" render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label={field.value ? 'Active' : 'Inactive'} />} /></Field>
      </form>
      <div className={step !== 'permissions' ? 'hidden' : ''}>
        {role === 'super_admin' ? (
          <p className="rounded-lg bg-primary-lighter/50 px-4 py-3 text-[13px] text-primary-dark">Super Admin has every permission automatically.</p>
        ) : (
          <Controller control={control} name="permissions" render={({ field }) => <PermissionMatrix value={field.value} onChange={field.onChange} />} />
        )}
      </div>
    </Modal>
  );
}

export default function UsersPage() {
  const [state, setState] = useListState();
  const [status, setStatus] = useState('');
  const q = useList<any>('users', '/api/admin/users', state, { isActive: status });
  const [edit, setEdit] = useState<any | null | undefined>(undefined);
  const [del, setDel] = useState<any | null>(null);
  const { can, user: me } = useAuthStore();
  const remove = useSave({ invalidate: ['users', 'lookup'], onSuccess: () => setDel(null) });
  const columns: Column<any>[] = [
    { key: 'name', header: 'Name', render: (r) => (<div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-lighter text-[12px] font-semibold text-primary-dark">{(r.firstName?.[0] ?? '') + (r.lastName?.[0] ?? '')}</span><div><div className="font-medium text-gray-900">{r.name}</div><div className="text-[12px] text-gray-500">{r.email}</div></div></div>) },
    { key: 'mobile', header: 'Mobile', render: (r) => r.mobile || '-' },
    { key: 'role', header: 'Role', render: (r) => <Badge color={r.role === 'super_admin' ? 'purple' : r.role === 'admin' ? 'blue' : 'gray'}>{r.role === 'super_admin' ? 'Super Admin' : r.role === 'admin' ? 'Admin' : 'User'}</Badge> },
    { key: 'userKind', header: 'Type', render: (r) => ({ system_user: 'System User', employee: 'Employee', user_and_employee: 'User & Employee' } as any)[r.userKind] ?? r.userKind, hidden: true },
    { key: 'lastLoginAt', header: 'Last Login', render: (r) => fmtDate(r.lastLoginAt, true) },
    { key: 'isActive', header: 'Status', render: (r) => (r.isActive ? <Badge color="green">Active</Badge> : <Badge color="red">Inactive</Badge>) },
    { key: 'createdAt', header: 'Created At', render: (r) => fmtDate(r.createdAt, true), hidden: true },
  ];
  return (
    <>
      <h2 className="mb-4 text-[20px] font-semibold text-gray-900">Users</h2>
      <DataTable storageKey="users" columns={columns} rows={q.data?.rows ?? []} total={q.data?.total} loading={q.isFetching} state={state} onStateChange={setState} rowKey={(r) => r.id} onRefresh={() => q.refetch()}
        toolbar={<Select size="sm" className="w-[150px]" value={status} onChange={setStatus} placeholder="All Status" options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]} />}
        actions={can('admin_users', 'create') && <button className="btn-primary" onClick={() => setEdit(null)}><Plus className="h-4 w-4" /> Add User</button>}
        rowActions={(r) => (<span className="inline-flex gap-1"><button className="icon-btn h-7 w-7" onClick={() => setEdit(r)}><Pencil className="h-3.5 w-3.5" /></button>{r.id !== me?.id && can('admin_users', 'delete') && <button className="icon-btn h-7 w-7 text-red-600" onClick={() => setDel(r)}><Trash2 className="h-3.5 w-3.5" /></button>}</span>)} />
      <UserForm open={edit !== undefined} onClose={() => setEdit(undefined)} row={edit} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} loading={remove.isPending} title="Delete user?" message={<>Delete <b>{del?.name}</b>?</>} onConfirm={() => del && remove.mutate({ method: 'delete', url: `/api/admin/users/${del.id}` })} />
    </>
  );
}
