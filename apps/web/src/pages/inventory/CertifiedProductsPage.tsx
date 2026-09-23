import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Gem, Hand, Pencil, Plus, ShoppingBasket, Trash2, Unlock } from 'lucide-react';
import { CERTIFIED_STATUSES, CERTIFIED_STATUS_LABELS, LAB_TYPE_LABELS, STOCK_STATUSES, STOCK_STATUS_LABELS, type FilterFieldDef } from '@diamondbill/shared';
import { DataTable, useListState, type Column } from '@/components/data/DataTable';
import { CustomFieldInputs, customFieldDisplay } from '@/components/data/CustomFieldInputs';
import { KpiTiles } from '@/components/data/Kpi';
import { Badge, Checkbox, Combobox, ConfirmDialog, Field, FormSection, Modal, RadioGroup, Select, Spinner, Tabs, TextArea, TextInput } from '@/components/ui';
import { api } from '@/lib/api';
import { applyApiErrors, useBranches, useCustomFields, useFirms, useList, useSave } from '@/lib/queries';
import { useAuthStore } from '@/store/auth';
import { fmtMoney, fmtNum, cx } from '@/lib/format';

const useMasters = () => useQuery({ queryKey: ['lookup-masters'], queryFn: () => api.get<any>('/api/common/lookups/masters'), staleTime: 60_000 });
const useLedgers = (types: string) => useQuery({ queryKey: ['ledgers-type', types], queryFn: () => api.get<any[]>(`/api/accounting/chart-of-accounts/ledgers?accountTypes=${types}`), staleTime: 60_000 });
const useContacts = (types: string) => useQuery({ queryKey: ['lookup', 'contacts', types], queryFn: () => api.get<any[]>(`/api/crm/lookup/contacts?${types.split(',').map((t) => `contactType=${t}`).join('&')}`), staleTime: 60_000 });

const defaults = { addStock: true, name: '', itemName: '', sku: '', stockStatus: 'available', hsnCode: '7102', unitId: '', taxGroupId: '', currency: 'INR', categoryIds: [] as string[], labId: '', certificateNo: '', salesAccountId: '', purchaseAccountId: '', purchasePrice: '', sellingPrice: '', rapaportPrice: '', rapBack: '', discountType: 'percent', discountValue: '0', weight: '', firmId: '', branchId: '', stockDate: new Date().toISOString().slice(0, 10), description: '', customFields: {} as Record<string, any> };

export function CertifiedForm({ open, onClose, id, onSaved }: { open: boolean; onClose: () => void; id?: string | null; onSaved?: (p: any) => void }) {
  const m = useMasters().data;
  const firms = useFirms();
  const purchaseAccs = useLedgers('expense,asset');
  const salesAccs = useLedgers('income');
  const detail = useQuery({ queryKey: ['certified', id], queryFn: () => api.get<any>(`/api/accounting/certified-products/${id}`), enabled: open && !!id });
  const nextSku = useQuery({ queryKey: ['certified', 'next-sku'], queryFn: () => api.get<{ sku: string }>('/api/accounting/certified-products/next-sku'), enabled: open && !id });
  const { register, handleSubmit, control, reset, watch, setValue, setError, formState: { errors } } = useForm<typeof defaults>({ defaultValues: defaults });
  const firmId = watch('firmId');
  const branches = useBranches(firmId || undefined);
  useEffect(() => {
    if (!open) return;
    if (id && detail.data) {
      const d = detail.data;
      reset({ ...defaults, addStock: true, name: d.productName ?? '', itemName: d.name ?? '', sku: d.sku, stockStatus: d.product?.stockStatus ?? 'available', hsnCode: d.hsnCode ?? '', unitId: d.unitId ?? '', taxGroupId: d.taxGroupId ?? '', currency: d.currency ?? 'INR', categoryIds: d.categoryIds ?? [], labId: d.labId ?? '', certificateNo: d.certificateNo ?? '', salesAccountId: d.salesAccountId ?? '', purchaseAccountId: d.purchaseAccountId ?? '', purchasePrice: String(d.purchasePrice ?? ''), sellingPrice: String(d.pricePerCarat ?? d.sellingPrice ?? ''), rapaportPrice: d.rapaportPrice ?? '', rapBack: d.rapBack ?? '', discountType: d.discountType ?? 'percent', discountValue: String(d.discountValue ?? 0), weight: String(d.weight ?? ''), firmId: d.firmId ?? '', branchId: d.branchId ?? '', description: d.description ?? '', customFields: d.customFields ?? {} });
    } else if (!id) {
      const f = firms.data?.find((x) => x.isDefault) ?? firms.data?.[0];
      reset({ ...defaults, sku: nextSku.data?.sku ?? '', firmId: f?.id ?? '', unitId: m?.units?.find((u: any) => u.uqcCode === 'CTM')?.id ?? '', salesAccountId: salesAccs.data?.find((a) => a.systemKey === 'sales')?.id ?? '', purchaseAccountId: purchaseAccs.data?.find((a) => a.systemKey === 'cogs' || a.systemKey === 'inventory_asset')?.id ?? '' });
    }
  }, [open, id, detail.data, nextSku.data, firms.data, m, salesAccs.data, purchaseAccs.data]); // eslint-disable-line
  useEffect(() => { if (!id && branches.data?.length && !watch('branchId')) setValue('branchId', branches.data.find((b) => b.isDefault)?.id ?? branches.data[0].id); }, [branches.data]); // eslint-disable-line
  const save = useSave({ invalidate: ['certified', 'items-lookup', 'stock-view'], onSuccess: (p) => { onSaved?.(p); onClose(); } });
  const num = (v: any) => (v === '' || v == null ? null : Number(v));
  const submit = handleSubmit((v) => {
    const body = { ...v, purchasePrice: num(v.purchasePrice) ?? 0, sellingPrice: num(v.sellingPrice) ?? 0, rapaportPrice: num(v.rapaportPrice), rapBack: num(v.rapBack), discountValue: num(v.discountValue) ?? 0, weight: num(v.weight), unitId: v.unitId || null, taxGroupId: v.taxGroupId || null, labId: v.labId || null, name: v.name || null, itemName: v.itemName || null };
    save.mutate({ method: id ? 'put' : 'post', url: id ? `/api/accounting/certified-products/${id}` : '/api/accounting/certified-products', body }, { onError: (e) => applyApiErrors(e, setError as any) });
  });
  const [rap, back, weight, sell, discT, discV] = [watch('rapaportPrice'), watch('rapBack'), watch('weight'), watch('sellingPrice'), watch('discountType'), watch('discountValue')];
  const rapNet = rap !== '' && rap != null ? Number(rap) * (1 - Number(back || 0) / 100) : null;
  const perCt = sell !== '' && sell != null ? Number(sell) : rapNet ?? 0;
  const net = discT === 'percent' ? perCt * (1 - Number(discV || 0) / 100) : perCt - Number(discV || 0);
  return (
    <Modal open={open} onClose={onClose} size="xl" title={id ? `Edit Stone — ${detail.data?.sku ?? ''}` : 'Add Certified Product'} footer={<><div className="mr-auto text-[13px] text-gray-600">Price/ct <b>{fmtMoney(perCt)}</b> · Net/ct <b>{fmtMoney(net)}</b> · Total <b className="text-gray-900">{fmtMoney(net * Number(weight || 0))}</b></div><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending && <Spinner />} {id ? 'Update' : 'Save'}</button></>}>
      {id && detail.isLoading ? <div className="py-10 text-center"><Spinner className="inline h-5 w-5" /></div> : (
        <form onSubmit={submit} className="-my-6">
          <FormSection title="Stock" description="Add to stock now (opening qty = weight) or catalog only.">
            {!id && <div className="sm:col-span-2 flex flex-wrap items-center gap-6"><Controller control={control} name="addStock" render={({ field }) => <Checkbox checked={field.value} onChange={field.onChange} label="Add stock" />} />{watch('addStock') && <Field label="Stock Date"><TextInput type="date" {...register('stockDate')} className="w-[170px]" /></Field>}</div>}
            <Field label="Firm" required error={errors.firmId?.message}><Controller control={control} name="firmId" rules={{ required: 'Firm is required' }} render={({ field }) => <Select value={field.value} onChange={(v) => { field.onChange(v); setValue('branchId', ''); }} options={(firms.data ?? []).map((f) => ({ value: f.id, label: f.name }))} />} /></Field>
            <Field label="Branch" required error={errors.branchId?.message}><Controller control={control} name="branchId" rules={{ required: 'Branch is required' }} render={({ field }) => <Select value={field.value} onChange={field.onChange} options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />} /></Field>
          </FormSection>
          <FormSection title="Identification">
            <Field label="SKU" required error={errors.sku?.message}><TextInput {...register('sku', { required: 'SKU is required' })} className="font-mono" /></Field>
            <Field label="Weight (ct)" required error={errors.weight?.message}><TextInput type="number" step="0.001" {...register('weight', { required: 'Weight is required' })} /></Field>
            <Field label="Name" hint="Auto from name template if blank (e.g. Round 1.02ct G VS1)"><TextInput {...register('name')} /></Field>
            <Field label="Sub Product Name" hint="Auto if blank"><TextInput {...register('itemName')} /></Field>
            <Field label="Lab"><Controller control={control} name="labId" render={({ field }) => <Select value={field.value} onChange={field.onChange} placeholder="Select lab" options={(m?.labs ?? []).map((l: any) => ({ value: l.id, label: `${l.name} (${LAB_TYPE_LABELS[l.labType as keyof typeof LAB_TYPE_LABELS] ?? l.labType})` }))} />} /></Field>
            <Field label="Certificate No"><TextInput {...register('certificateNo')} /></Field>
            <Field label="Stock Status"><Controller control={control} name="stockStatus" render={({ field }) => <Select value={field.value} onChange={field.onChange} options={STOCK_STATUSES.map((s) => ({ value: s, label: STOCK_STATUS_LABELS[s] }))} />} /></Field>
            <Field label="Category"><Controller control={control} name="categoryIds" render={({ field }) => <Combobox multiple value={field.value} onChange={field.onChange} options={(m?.categories ?? []).map((c: any) => ({ value: c.id, label: c.name }))} />} /></Field>
          </FormSection>
          <FormSection title="Accounts & Tax">
            <Field label="Sales A/C" required error={errors.salesAccountId?.message}><Controller control={control} name="salesAccountId" rules={{ required: 'Required' }} render={({ field }) => <Combobox value={field.value} onChange={field.onChange} options={(salesAccs.data ?? []).map((a) => ({ value: a.id, label: a.name, sub: a.subTypeLabel }))} />} /></Field>
            <Field label="Purchase A/C" required error={errors.purchaseAccountId?.message}><Controller control={control} name="purchaseAccountId" rules={{ required: 'Required' }} render={({ field }) => <Combobox value={field.value} onChange={field.onChange} options={(purchaseAccs.data ?? []).map((a) => ({ value: a.id, label: a.name, sub: a.subTypeLabel }))} />} /></Field>
            <Field label="HSN / SAC"><TextInput {...register('hsnCode')} /></Field>
            <Field label="Unit"><Controller control={control} name="unitId" render={({ field }) => <Select value={field.value} onChange={field.onChange} options={(m?.units ?? []).map((u: any) => ({ value: u.id, label: `${u.name} (${u.uqcCode})` }))} />} /></Field>
            <Field label="Tax"><Controller control={control} name="taxGroupId" render={({ field }) => <Select value={field.value} onChange={field.onChange} placeholder="Select tax" options={(m?.taxGroups ?? []).map((t: any) => ({ value: t.id, label: `${t.name} (${t.rate}%)` }))} />} /></Field>
            <Field label="Currency" required><TextInput {...register('currency')} className="uppercase" /></Field>
          </FormSection>
          <FormSection title="Pricing (per carat)" description="Selling price overrides Rapaport − back. Discount + = discount, − = premium.">
            <Field label="Purchase Price / ct"><TextInput type="number" step="any" {...register('purchasePrice')} /></Field>
            <Field label="Selling Price / ct" hint={rapNet != null ? `Rapaport net: ${fmtMoney(rapNet)}` : undefined}><TextInput type="number" step="any" {...register('sellingPrice')} placeholder={rapNet != null ? String(rapNet.toFixed(2)) : ''} /></Field>
            <Field label="Rapaport Price ($/ct)"><TextInput type="number" step="any" {...register('rapaportPrice')} /></Field>
            <Field label="Rap Back %"><TextInput type="number" step="any" {...register('rapBack')} placeholder="35" /></Field>
            <Field label="Discount Type"><Controller control={control} name="discountType" render={({ field }) => <RadioGroup value={field.value} onChange={field.onChange} options={[{ value: 'percent', label: 'Percentage' }, { value: 'amount', label: 'Amount' }]} />} /></Field>
            <Field label="Discount Value"><TextInput type="number" step="any" {...register('discountValue')} /></Field>
          </FormSection>
          <FormSection title="Diamond Properties" description="Fields from Settings → Custom Field → Certified Products (Shape, Color, Clarity, Cut …).">
            <div className="sm:col-span-2"><Controller control={control} name="customFields" render={({ field }) => <CustomFieldInputs moduleName="certified_products" value={field.value} onChange={field.onChange} />} /></div>
          </FormSection>
          <FormSection title="Description"><Field className="sm:col-span-2"><TextArea {...register('description')} /></Field></FormSection>
        </form>
      )}
    </Modal>
  );
}

function HoldDialog({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const customers = useContacts('customer,customer_vendor');
  const brokers = useContacts('broker');
  const [c, setC] = useState(''); const [b, setB] = useState('');
  const save = useSave({ invalidate: ['certified'], onSuccess: onClose });
  return (
    <Modal open={ids.length > 0} onClose={onClose} size="sm" title={`Hold ${ids.length} stone(s)`} footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate({ method: 'post', url: '/api/accounting/certified-products/bulk', body: { ids, action: 'hold', holdCustomerId: c || null, holdBrokerId: b || null } })}>{save.isPending && <Spinner />} Hold</button></>}>
      <div className="space-y-4">
        <Field label="Hold for Customer"><Combobox value={c} onChange={setC} options={(customers.data ?? []).map((x) => ({ value: x.id, label: x.display ?? x.companyName }))} /></Field>
        <Field label="Broker"><Combobox value={b} onChange={setB} options={(brokers.data ?? []).map((x) => ({ value: x.id, label: x.display ?? x.companyName }))} /></Field>
      </div>
    </Modal>
  );
}

export default function CertifiedProductsPage() {
  const [state, setState] = useListState({ sortBy: 'createdAt' });
  const [tab, setTab] = useState('all');
  const [firmId, setFirmId] = useState('');
  const [branchId, setBranchId] = useState('');
  const firms = useFirms();
  const branches = useBranches(firmId || undefined);
  const q = useList<any>('certified', '/api/accounting/certified-products', state, { tab: tab === 'all' ? undefined : tab, firmId, branchId });
  const cf = useCustomFields('certified_products');
  const [edit, setEdit] = useState<string | null | undefined>(undefined);
  const [del, setDel] = useState<any | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [holdIds, setHoldIds] = useState<string[]>([]);
  const [basket, setBasket] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('basket') ?? '[]'); } catch { return []; } });
  useEffect(() => { try { localStorage.setItem('basket', JSON.stringify(basket)); } catch {} }, [basket]);
  const can = useAuthStore((s) => s.can);
  const remove = useSave({ invalidate: ['certified'], onSuccess: () => setDel(null) });
  const act = useSave({ invalidate: ['certified'] });
  const k = q.data?.kpis;
  const cfCols = useMemo<Column<any>[]>(() => (cf.data ?? []).slice(0, 12).map((f: any) => ({ key: `cf_${f.fieldName}`, header: f.fieldLabel, sortable: false, hidden: !['shape', 'color', 'clarity', 'cut', 'polish', 'symmetry', 'fluorescence_intensity', 'repo_rate_size'].includes(f.fieldName), render: (r: any) => customFieldDisplay(f, r.customFields?.[f.fieldName]) })), [cf.data]);
  const statusColor: Record<string, any> = { available: 'green', on_hold: 'amber', memo: 'blue', sold: 'gray', lab: 'purple', in_process: 'purple', disabled: 'red' };
  const columns: Column<any>[] = [
    { key: 'name', header: 'Name', locked: true, render: (r) => (<div className="flex items-center gap-2"><Gem className="h-4 w-4 text-primary" /><div><div className="font-medium text-gray-900">{r.productName}</div><div className="font-mono text-[11px] text-gray-500">{r.sku}</div></div></div>) },
    { key: 'sku', header: 'SKU', hidden: true },
    { key: 'itemName', header: 'Sub Product Name', hidden: true, render: (r) => r.name },
    { key: 'firmName', header: 'Firm', hidden: true },
    { key: 'branchName', header: 'Branch' },
    { key: 'weight', header: 'Weight', align: 'right', render: (r) => `${fmtNum(r.weight, 3)} ct` },
    { key: 'status', header: 'Status', render: (r) => <Badge color={statusColor[r.status] ?? 'gray'}>{r.statusLabel}</Badge> },
    { key: 'holdCustomerName', header: 'Hold Customer', render: (r) => r.holdCustomerName || '-' },
    { key: 'holdBrokerName', header: 'Hold Broker', hidden: true, render: (r) => r.holdBrokerName || '-' },
    { key: 'labName', header: 'Lab', render: (r) => r.labName || '-' },
    { key: 'certificateNo', header: 'Certificate', hidden: true, render: (r) => r.certificateNo || '-' },
    ...cfCols,
    { key: 'discountType', header: 'Discount Type', hidden: true, render: (r) => (r.discountType === 'percent' ? 'Percentage' : 'Amount') },
    { key: 'discountValue', header: 'Discount', align: 'right', hidden: true, render: (r) => (r.discountType === 'percent' ? `${r.discountValue}%` : fmtMoney(r.discountValue)) },
    { key: 'hsnCode', header: 'HSN', hidden: true },
    { key: 'unitName', header: 'Unit', hidden: true },
    { key: 'taxName', header: 'Tax', hidden: true },
    { key: 'rapaportPrice', header: 'Rapaport', align: 'right', render: (r) => (r.rapaportPrice != null ? `$${fmtNum(r.rapaportPrice)}` : '-') },
    { key: 'rapBack', header: 'RapBack', align: 'right', render: (r) => (r.rapBack != null ? `${r.rapBack}%` : '-') },
    { key: 'pricePerCarat', header: 'Price / ct', align: 'right', render: (r) => fmtMoney(r.pricePerCarat) },
    { key: 'totalSalesPrice', header: 'Total Sales', align: 'right', sortable: false, render: (r) => <span className="font-medium text-gray-900">{fmtMoney(r.totalSalesPrice)}</span> },
    { key: 'totalPurchasePrice', header: 'Total Purchase', align: 'right', sortable: false, hidden: true, render: (r) => fmtMoney(r.totalPurchasePrice) },
    { key: 'memoOut', header: 'Memo Out', align: 'right', sortable: false, hidden: true, render: (r) => fmtNum(r.stock?.memoOut, 3) },
    { key: 'saleable', header: 'Saleable', align: 'right', sortable: false, hidden: true, render: (r) => fmtNum(r.stock?.saleable, 3) },
  ];
  const filterFields: FilterFieldDef[] = [
    { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Name' }, { key: 'certificateNo', label: 'Certificate No' }, { key: 'status', label: 'Status', type: 'select', options: CERTIFIED_STATUSES.map((s) => ({ value: s, label: CERTIFIED_STATUS_LABELS[s] })) }, { key: 'weight', label: 'Weight (ct)', type: 'number' }, { key: 'pricePerCarat', label: 'Price / ct', type: 'number' }, { key: 'rapBack', label: 'Rap Back %', type: 'number' }, { key: 'labName', label: 'Lab' }, { key: 'holdCustomerName', label: 'Hold Customer' }, { key: 'createdAt', label: 'Created At', type: 'date' },
  ];
  const selRows = (q.data?.rows ?? []).filter((r: any) => selected.includes(r.id));
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[20px] font-semibold text-gray-900">Certified Products</h2>
        <div className="flex items-center gap-2 text-[13px]">
          <span className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-3 py-1.5 text-gray-700"><ShoppingBasket className="h-4 w-4 text-primary" /> Basket <b>{basket.length}</b></span>
          {basket.length > 0 && <button className="btn-ghost" onClick={() => setBasket([])}>Clear</button>}
          {selected.length > 0 && <button className="btn-outline-primary" onClick={() => setBasket((b) => Array.from(new Set([...b, ...selected])))}>Add {selected.length} to Basket</button>}
        </div>
      </div>
      <KpiTiles items={[{ label: 'Total', value: k?.total ?? 0 }, { label: 'In Stock', value: k?.stock ?? 0, tone: 'good' }, { label: 'On Memo', value: k?.memo ?? 0, tone: 'warn' }, { label: 'Net Rate / ct', value: fmtMoney(k?.netRate ?? 0), hint: `${fmtNum(k?.weight ?? 0, 3)} ct` }, { label: 'Net Value', value: fmtMoney(k?.netValue ?? 0) }]} />
      <DataTable storageKey="certified" filterFields={filterFields} columns={columns} rows={q.data?.rows ?? []} total={q.data?.total} loading={q.isFetching} state={state} onStateChange={setState} rowKey={(r) => r.id} onRefresh={() => q.refetch()} selectable selected={selected} onSelectedChange={setSelected} searchPlaceholder="Search SKU / name / certificate / properties" onImport={() => {}}
        toolbar={<>
          <div className="flex rounded-lg border border-line p-0.5 text-[13px]">{[['all', 'All'], ['on_hold', 'On Hold'], ['purchase', 'Purchase'], ['sale', 'Sale']].map(([v, l]) => <button key={v} onClick={() => setTab(v)} className={cx('rounded-md px-3 py-1', tab === v ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50')}>{l}</button>)}</div>
          <Select size="sm" className="w-[160px]" value={firmId} onChange={(v) => { setFirmId(v); setBranchId(''); }} placeholder="All Firms" options={(firms.data ?? []).map((f) => ({ value: f.id, label: f.name }))} />
          <Select size="sm" className="w-[150px]" value={branchId} onChange={setBranchId} placeholder="All Branches" options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
        </>}
        actions={<>
          {selected.length > 0 && can('acc_certified_stock', 'update') && (<>
            {selRows.some((r: any) => r.status === 'available') && <button className="btn-outline" onClick={() => setHoldIds(selRows.filter((r: any) => r.status === 'available').map((r: any) => r.id))}><Hand className="h-4 w-4" /> Hold</button>}
            {selRows.some((r: any) => r.status === 'on_hold') && <button className="btn-outline" onClick={() => act.mutate({ method: 'post', url: '/api/accounting/certified-products/bulk', body: { ids: selRows.filter((r: any) => r.status === 'on_hold').map((r: any) => r.id), action: 'release' } })}><Unlock className="h-4 w-4" /> Release</button>}
          </>)}
          {can('acc_certified_stock', 'create') && <button className="btn-primary" onClick={() => setEdit(null)}><Plus className="h-4 w-4" /> Add</button>}
        </>}
        onRowClick={(r) => can('acc_certified_stock', 'update') && setEdit(r.id)}
        rowActions={(r) => (<span className="inline-flex gap-1">
          {r.status === 'available' && <button className="icon-btn h-7 w-7" title="Hold" onClick={() => setHoldIds([r.id])}><Hand className="h-3.5 w-3.5" /></button>}
          {r.status === 'on_hold' && <button className="icon-btn h-7 w-7" title="Release" onClick={() => act.mutate({ method: 'post', url: `/api/accounting/certified-products/${r.id}/release` })}><Unlock className="h-3.5 w-3.5" /></button>}
          <button className="icon-btn h-7 w-7" onClick={() => setEdit(r.id)}><Pencil className="h-3.5 w-3.5" /></button>
          {can('acc_certified_stock', 'delete') && <button className="icon-btn h-7 w-7 text-red-600" onClick={() => setDel(r)}><Trash2 className="h-3.5 w-3.5" /></button>}
        </span>)}
        emptyTitle="No certified stones" emptyDescription="Add single stones with their GIA/IGI properties. Set up properties under Settings → Custom Field → Auto Import Property first." />
      <CertifiedForm open={edit !== undefined} onClose={() => setEdit(undefined)} id={edit} />
      <HoldDialog ids={holdIds} onClose={() => setHoldIds([])} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} loading={remove.isPending} title="Delete stone?" message={<>Delete <b>{del?.sku}</b>? Only stones without transactions can be deleted.</>} onConfirm={() => del && remove.mutate({ method: 'delete', url: `/api/accounting/certified-products/${del.id}` })} />
    </>
  );
}
