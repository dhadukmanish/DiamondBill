import { useEffect, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Package, Pencil, Plus, Trash2, X } from 'lucide-react';
import { PRODUCT_STOCK_TYPES, PRODUCT_STOCK_TYPE_LABELS, STOCK_STATUSES, STOCK_STATUS_LABELS, type FilterFieldDef } from '@diamondbill/shared';
import { DataTable, useListState, type Column } from '@/components/data/DataTable';
import { CustomFieldInputs } from '@/components/data/CustomFieldInputs';
import { Badge, Combobox, ConfirmDialog, Field, FormSection, Modal, RadioGroup, Select, Spinner, Switch, Tabs, TextArea, TextInput } from '@/components/ui';
import { api } from '@/lib/api';
import { applyApiErrors, useList, useSave } from '@/lib/queries';
import { useAuthStore } from '@/store/auth';
import { fmtMoney, fmtNum, cx } from '@/lib/format';

const useMasters = () => useQuery({ queryKey: ['lookup-masters'], queryFn: () => api.get<any>('/api/common/lookups/masters'), staleTime: 60_000 });
const useLedgers = (types: string) => useQuery({ queryKey: ['ledgers-type', types], queryFn: () => api.get<any[]>(`/api/accounting/chart-of-accounts/ledgers?accountTypes=${types}`), staleTime: 60_000 });

const emptyItem = { id: undefined as string | undefined, name: '', sku: '', barcode: '', purchasePrice: '', sellingPrice: '', mrp: '', isDefault: false, isActive: true, customFields: {} as Record<string, any> };
const defaults = { name: '', productType: 'goods', stockType: 'general', serialNo: '', unitId: '', hsnCode: '', categoryIds: [] as string[], shortDescription: '', details: '', trackingType: 'sku', purchaseAccountId: '', salesAccountId: '', purchasePrice: '', sellingPrice: '', currency: 'INR', taxGroupId: '', stockStatus: 'available', images: [] as string[], lowStockQty: '', isActive: true, customFields: {} as Record<string, any>, items: [] as (typeof emptyItem)[] };

export function ProductForm({ open, onClose, id, onSaved }: { open: boolean; onClose: () => void; id?: string | null; onSaved?: (p: any) => void }) {
  const masters = useMasters();
  const purchaseAccs = useLedgers('expense,asset');
  const salesAccs = useLedgers('income');
  const [tab, setTab] = useState('basic');
  const detail = useQuery({ queryKey: ['product', id], queryFn: () => api.get<any>(`/api/accounting/products/${id}`), enabled: open && !!id });
  const nextSerial = useQuery({ queryKey: ['products', 'next-serial'], queryFn: () => api.get<{ serialNo: number; sku: string }>('/api/accounting/products/next-serial'), enabled: open && !id });
  const { register, handleSubmit, control, reset, watch, setValue, setError, formState: { errors } } = useForm<typeof defaults>({ defaultValues: defaults });
  const items = useFieldArray({ control, name: 'items' });
  useEffect(() => {
    if (!open) return;
    setTab('basic');
    if (id && detail.data) {
      const d = detail.data;
      reset({ ...defaults, ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v ?? ''])), serialNo: String(d.serialNo ?? ''), purchasePrice: String(d.purchasePrice ?? ''), sellingPrice: String(d.sellingPrice ?? ''), lowStockQty: String(d.lowStockQty ?? ''), categoryIds: d.categoryIds ?? [], customFields: d.customFields ?? {}, images: d.images ?? [], items: (d.items ?? []).map((i: any) => ({ id: i.id, name: i.name, sku: i.sku, barcode: i.barcode ?? '', purchasePrice: String(i.purchasePrice), sellingPrice: String(i.sellingPrice), mrp: i.mrp ?? '', isDefault: i.isDefault, isActive: i.isActive, customFields: i.customFields ?? {} })) });
    } else if (!id) reset({ ...defaults, serialNo: String(nextSerial.data?.serialNo ?? ''), items: [{ ...emptyItem, sku: nextSerial.data?.sku ?? '', isDefault: true }] });
  }, [open, id, detail.data, nextSerial.data]); // eslint-disable-line
  const save = useSave({ invalidate: ['products', 'items-lookup', 'stock-view'], onSuccess: (p) => { onSaved?.(p); onClose(); } });
  const num = (v: any) => (v === '' || v == null ? 0 : Number(v));
  const submit = handleSubmit((v) => {
    const body = { ...v, serialNo: v.serialNo === '' ? null : Number(v.serialNo), purchasePrice: num(v.purchasePrice), sellingPrice: num(v.sellingPrice), lowStockQty: v.lowStockQty === '' ? null : Number(v.lowStockQty), unitId: v.unitId || null, taxGroupId: v.taxGroupId || null, purchaseAccountId: v.purchaseAccountId || null, salesAccountId: v.salesAccountId || null, items: v.items.map((i) => ({ ...i, id: i.id || undefined, barcode: i.barcode || null, purchasePrice: num(i.purchasePrice), sellingPrice: num(i.sellingPrice), mrp: i.mrp === '' ? null : Number(i.mrp) })) };
    save.mutate({ method: id ? 'put' : 'post', url: id ? `/api/accounting/products/${id}` : '/api/accounting/products', body }, { onError: (e) => { applyApiErrors(e, setError as any); setTab('basic'); } });
  });
  const productType = watch('productType');
  const stockType = watch('stockType');
  const name = watch('name');
  const m = masters.data;
  return (
    <Modal open={open} onClose={onClose} size="xl" title={id ? `Edit Product — ${detail.data?.name ?? ''}` : 'New Product'} footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending && <Spinner />} {id ? 'Update' : 'Save'}</button></>}>
      {id && detail.isLoading ? <div className="py-10 text-center"><Spinner className="inline h-5 w-5" /></div> : (
        <>
          <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[{ value: 'basic', label: 'Basic' }, { value: 'inventory', label: 'Inventory & Sub-products', count: items.fields.length }, { value: 'commercial', label: 'Commercials' }, { value: 'custom', label: 'Custom Fields' }]} />
          <form onSubmit={submit} className="-my-6">
            <div className={tab !== 'basic' ? 'hidden' : ''}>
              <FormSection title="Product Type">
                <div className="sm:col-span-2 flex flex-wrap gap-6">
                  <Controller control={control} name="productType" render={({ field }) => <RadioGroup value={field.value} onChange={field.onChange} options={[{ value: 'goods', label: 'Goods' }, { value: 'service', label: 'Service' }]} />} />
                  {productType === 'goods' && <Controller control={control} name="stockType" render={({ field }) => <Select value={field.value} onChange={field.onChange} className="w-[200px]" disabled={!!id} options={PRODUCT_STOCK_TYPES.filter((s) => s !== 'certified').map((s) => ({ value: s, label: PRODUCT_STOCK_TYPE_LABELS[s] }))} />} />}
                </div>
              </FormSection>
              <FormSection title="Basic Information">
                <Field label="Product Name" required error={errors.name?.message} className="sm:col-span-2"><TextInput {...register('name', { required: 'Product name is required' })} /></Field>
                <Field label="Serial No."><TextInput type="number" {...register('serialNo')} /></Field>
                <Field label="Stock Status"><Controller control={control} name="stockStatus" render={({ field }) => <Select value={field.value} onChange={field.onChange} options={STOCK_STATUSES.map((s) => ({ value: s, label: STOCK_STATUS_LABELS[s] }))} />} /></Field>
                <Field label="Unit"><Controller control={control} name="unitId" render={({ field }) => <Select value={field.value} onChange={field.onChange} placeholder="Select unit" options={(m?.units ?? []).map((u: any) => ({ value: u.id, label: `${u.name} (${u.uqcCode})` }))} />} /></Field>
                <Field label="HSN / SAC Code"><TextInput {...register('hsnCode')} placeholder="7102" /></Field>
                <Field label="Category" className="sm:col-span-2"><Controller control={control} name="categoryIds" render={({ field }) => <Combobox multiple value={field.value} onChange={field.onChange} options={(m?.categories ?? []).map((c: any) => ({ value: c.id, label: c.name }))} placeholder="Select categories" />} /></Field>
                <Field label="Short Description" className="sm:col-span-2"><TextInput {...register('shortDescription')} /></Field>
                <Field label="Product Details" hint="Shown on public shop / print" className="sm:col-span-2"><TextArea {...register('details')} /></Field>
                <Field label="Low Stock Alert Qty"><TextInput type="number" step="any" {...register('lowStockQty')} /></Field>
                <div className="flex items-end pb-2"><Controller control={control} name="isActive" render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label="Active" />} /></div>
              </FormSection>
            </div>
            <div className={tab !== 'inventory' ? 'hidden' : ''}>
              <FormSection title="Tracking" description="How stock of this product is identified.">
                <div className="sm:col-span-2"><Controller control={control} name="trackingType" render={({ field }) => <RadioGroup value={field.value} onChange={field.onChange} options={[{ value: 'sku', label: 'SKU tracking (per sub-product)' }, { value: 'serialized', label: 'Serialized (each piece unique)' }, { value: 'batch', label: 'Batch / lot' }]} />} /></div>
              </FormSection>
              <div className="py-6">
                <div className="mb-3 flex items-center justify-between"><h4 className="text-[15px] font-semibold text-gray-900">Sub-products <span className="text-[12px] font-normal text-gray-500">(variants — each with its own SKU & stock)</span></h4><button type="button" className="btn-outline-primary" onClick={() => items.append({ ...emptyItem, name: name ? `${name} - ${items.fields.length + 1}` : '' })}><Plus className="h-4 w-4" /> Add Sub-product</button></div>
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="min-w-full">
                    <thead className="bg-head"><tr><th className="table-head">Name</th><th className="table-head">SKU</th><th className="table-head">Barcode</th><th className="table-head text-right">Purchase</th><th className="table-head text-right">Selling</th><th className="table-head text-right">MRP</th><th className="table-head text-center">Default</th><th className="table-head text-center">Active</th><th className="table-head" /></tr></thead>
                    <tbody className="divide-y divide-line">
                      {items.fields.map((f, i) => (
                        <tr key={f.id}>
                          <td className="table-cell !px-2 !py-1.5"><TextInput size="sm" {...register(`items.${i}.name`, { required: true })} className="w-[220px]" /></td>
                          <td className="table-cell !px-2 !py-1.5"><TextInput size="sm" {...register(`items.${i}.sku`)} className="w-[130px] font-mono" placeholder="auto" /></td>
                          <td className="table-cell !px-2 !py-1.5"><TextInput size="sm" {...register(`items.${i}.barcode`)} className="w-[120px] font-mono" /></td>
                          <td className="table-cell !px-2 !py-1.5"><TextInput size="sm" type="number" step="any" {...register(`items.${i}.purchasePrice`)} className="w-[100px] text-right" /></td>
                          <td className="table-cell !px-2 !py-1.5"><TextInput size="sm" type="number" step="any" {...register(`items.${i}.sellingPrice`)} className="w-[100px] text-right" /></td>
                          <td className="table-cell !px-2 !py-1.5"><TextInput size="sm" type="number" step="any" {...register(`items.${i}.mrp`)} className="w-[90px] text-right" /></td>
                          <td className="table-cell !px-2 !py-1.5 text-center"><input type="radio" name="defaultItem" checked={!!watch(`items.${i}.isDefault`)} onChange={() => items.fields.forEach((_, j) => setValue(`items.${j}.isDefault`, j === i))} className="accent-primary" /></td>
                          <td className="table-cell !px-2 !py-1.5 text-center"><Controller control={control} name={`items.${i}.isActive`} render={({ field }) => <Switch checked={field.value} onChange={field.onChange} />} /></td>
                          <td className="table-cell !px-2 !py-1.5"><button type="button" className="icon-btn h-7 w-7 text-red-600" onClick={() => items.remove(i)} disabled={items.fields.length === 1}><X className="h-3.5 w-3.5" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[12px] text-gray-500">Leave SKU empty to auto-generate. Sub-product name is auto-built from Settings → Product Name Templates ({PRODUCT_STOCK_TYPE_LABELS[stockType as keyof typeof PRODUCT_STOCK_TYPE_LABELS]}) when left blank on create.</p>
              </div>
            </div>
            <div className={tab !== 'commercial' ? 'hidden' : ''}>
              <FormSection title="Purchase" description="Account & default price used when buying.">
                <Field label="Purchase Account" required><Controller control={control} name="purchaseAccountId" render={({ field }) => <Combobox value={field.value} onChange={field.onChange} options={(purchaseAccs.data ?? []).map((a) => ({ value: a.id, label: a.name, sub: a.subTypeLabel }))} />} /></Field>
                <Field label="Purchase Price"><TextInput type="number" step="any" {...register('purchasePrice')} /></Field>
              </FormSection>
              <FormSection title="Sales" description="Account & default price used when selling.">
                <Field label="Sales Account" required><Controller control={control} name="salesAccountId" render={({ field }) => <Combobox value={field.value} onChange={field.onChange} options={(salesAccs.data ?? []).map((a) => ({ value: a.id, label: a.name, sub: a.subTypeLabel }))} />} /></Field>
                <Field label="Selling Price"><TextInput type="number" step="any" {...register('sellingPrice')} /></Field>
              </FormSection>
              <FormSection title="Currency & Tax">
                <Field label="Currency" required><TextInput {...register('currency')} className="uppercase" /></Field>
                <Field label="Tax"><Controller control={control} name="taxGroupId" render={({ field }) => <Select value={field.value} onChange={field.onChange} placeholder="Select tax" options={(m?.taxGroups ?? []).map((t: any) => ({ value: t.id, label: `${t.name} (${t.rate}%)` }))} />} /></Field>
              </FormSection>
            </div>
            <div className={cx('py-6', tab !== 'custom' && 'hidden')}>
              <Controller control={control} name="customFields" render={({ field }) => <CustomFieldInputs moduleName="products" value={field.value} onChange={field.onChange} />} />
              <p className="mt-3 text-[12px] text-gray-500">Add fields under Settings → Custom Field → module "Products".</p>
            </div>
          </form>
        </>
      )}
    </Modal>
  );
}

export default function ProductsPage() {
  const [state, setState] = useListState({ sortBy: 'createdAt' });
  const [stockType, setStockType] = useState('');
  const q = useList<any>('products', '/api/accounting/products', state, { stockType });
  const [edit, setEdit] = useState<string | null | undefined>(undefined);
  const [del, setDel] = useState<any | null>(null);
  const can = useAuthStore((s) => s.can);
  const remove = useSave({ invalidate: ['products', 'items-lookup'], onSuccess: () => setDel(null) });
  const filterFields: FilterFieldDef[] = [
    { key: 'name', label: 'Name' }, { key: 'hsnCode', label: 'HSN' }, { key: 'stockType', label: 'Stock Type', type: 'select', options: PRODUCT_STOCK_TYPES.map((s) => ({ value: s, label: PRODUCT_STOCK_TYPE_LABELS[s] })) }, { key: 'productType', label: 'Product Type', type: 'select', options: [{ value: 'goods', label: 'Goods' }, { value: 'service', label: 'Service' }] }, { key: 'stockStatus', label: 'Stock Status', type: 'select', options: STOCK_STATUSES.map((s) => ({ value: s, label: STOCK_STATUS_LABELS[s] })) }, { key: 'purchasePrice', label: 'Purchase Price', type: 'number' }, { key: 'sellingPrice', label: 'Selling Price', type: 'number' }, { key: 'isActive', label: 'Active', type: 'boolean' }, { key: 'createdAt', label: 'Created At', type: 'date' },
  ];
  const columns: Column<any>[] = [
    { key: 'name', header: 'Name', locked: true, render: (r) => (<div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-400">{r.images?.[0] ? <img src={r.images[0]} className="h-9 w-9 rounded-lg object-cover" /> : <Package className="h-4 w-4" />}</span><div><div className="font-medium text-gray-900">{r.name}</div><div className="text-[12px] text-gray-500">{PRODUCT_STOCK_TYPE_LABELS[r.stockType as keyof typeof PRODUCT_STOCK_TYPE_LABELS]} · {r.itemCount} sub-product{r.itemCount === 1 ? '' : 's'}</div></div></div>) },
    { key: 'hsnCode', header: 'HSN', render: (r) => r.hsnCode || '-' },
    { key: 'unitName', header: 'Unit', render: (r) => r.unitName || '-' },
    { key: 'purchasePrice', header: 'Purchase', align: 'right', render: (r) => fmtMoney(r.purchasePrice) },
    { key: 'sellingPrice', header: 'Sales', align: 'right', render: (r) => fmtMoney(r.sellingPrice) },
    { key: 'avgRate', header: 'Avg Rate', align: 'right', sortable: false, render: (r) => fmtMoney(r.avgRate) },
    { key: 'stockQty', header: 'Stock', align: 'right', sortable: false, render: (r) => <span className={cx('font-medium', r.stockQty > 0 ? 'text-gray-900' : 'text-gray-400')}>{fmtNum(r.stockQty, 3)}</span> },
    { key: 'stockStatus', header: 'Stock Status', render: (r) => <Badge color={r.stockStatus === 'available' ? 'green' : r.stockStatus === 'disable' ? 'red' : 'amber'}>{STOCK_STATUS_LABELS[r.stockStatus as keyof typeof STOCK_STATUS_LABELS]}</Badge> },
    { key: 'isActive', header: 'Active', hidden: true, render: (r) => (r.isActive ? 'Yes' : 'No') },
  ];
  return (
    <>
      <h2 className="mb-4 text-[20px] font-semibold text-gray-900">Products</h2>
      <DataTable storageKey="products" filterFields={filterFields} columns={columns} rows={q.data?.rows ?? []} total={q.data?.total} loading={q.isFetching} state={state} onStateChange={setState} rowKey={(r) => r.id} onRefresh={() => q.refetch()} searchPlaceholder="Search name / SKU / HSN" onImport={() => {}}
        toolbar={<Select size="sm" className="w-[180px]" value={stockType} onChange={setStockType} placeholder="All Stock Types" options={PRODUCT_STOCK_TYPES.filter((s) => s !== 'certified').map((s) => ({ value: s, label: PRODUCT_STOCK_TYPE_LABELS[s] }))} />}
        onRowClick={(r) => can('acc_products', 'update') && setEdit(r.id)}
        actions={can('acc_products', 'create') && <button className="btn-primary" onClick={() => setEdit(null)}><Plus className="h-4 w-4" /> Add Product</button>}
        rowActions={(r) => (<span className="inline-flex gap-1"><button className="icon-btn h-7 w-7" onClick={() => setEdit(r.id)}><Pencil className="h-3.5 w-3.5" /></button>{can('acc_products', 'delete') && <button className="icon-btn h-7 w-7 text-red-600" onClick={() => setDel(r)}><Trash2 className="h-3.5 w-3.5" /></button>}</span>)}
        emptyTitle="No products yet" emptyDescription="Add general products, loose diamond parcels, metals or jewellery here. Single certified stones live under Certified Products." />
      <ProductForm open={edit !== undefined} onClose={() => setEdit(undefined)} id={edit} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} loading={remove.isPending} title="Delete product?" message={<>Delete <b>{del?.name}</b> and its sub-products?</>} onConfirm={() => del && remove.mutate({ method: 'delete', url: `/api/accounting/products/${del.id}` })} />
    </>
  );
}
