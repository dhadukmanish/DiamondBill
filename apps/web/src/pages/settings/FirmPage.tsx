import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { DataTable, useListState, type Column } from '@/components/data/DataTable';
import { Badge, ConfirmDialog, Field, FormSection, Modal, RadioGroup, Select, Spinner, Switch, TextInput } from '@/components/ui';
import { applyApiErrors, useCurrencies, useList, useSave } from '@/lib/queries';
import { useAuthStore } from '@/store/auth';
import { fmtDate } from '@/lib/format';

const COUNTRIES = [{ value: 'IN', label: 'India' }, { value: 'US', label: 'United States' }, { value: 'AE', label: 'United Arab Emirates' }, { value: 'HK', label: 'Hong Kong' }, { value: 'BE', label: 'Belgium' }, { value: 'IL', label: 'Israel' }, { value: 'GB', label: 'United Kingdom' }];
const GST_TREATMENTS = [{ value: 'registered_regular', label: 'Registered Business - Regular' }, { value: 'registered_composition', label: 'Registered Business - Composition' }, { value: 'unregistered', label: 'Unregistered Business' }, { value: 'consumer', label: 'Consumer' }, { value: 'overseas', label: 'Overseas' }, { value: 'sez', label: 'Special Economic Zone' }];
const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Hong_Kong', 'Europe/Brussels', 'Asia/Jerusalem', 'America/New_York', 'Europe/London', 'UTC'].map((t) => ({ value: t, label: t }));
const TAX_LABELS = ['GSTIN', 'PAN', 'TAN', 'IEC', 'CIN'];
export const INDIAN_STATES = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Chandigarh', 'Jammu and Kashmir', 'Ladakh', 'Puducherry'];

type Firm = Record<string, any>;
const empty: Firm = { name: '', countryCode: 'IN', gstTreatment: 'registered_regular', website: '', placeOfSupply: 'Gujarat', contactNumbers: [''], emails: [''], taxIds: TAX_LABELS.map((label) => ({ label, value: '', enabled: label === 'GSTIN' })), addressLine1: '', state: 'Gujarat', city: '', area: '', pincode: '', googleMapUrl: '', currency: 'INR', currencyFormat: '1,234,567.89', amountInWordsFormat: 'indian', timeZone: 'Asia/Kolkata', dateFormat: 'dd-MM-yyyy', timeFormat: 'hh:mm tt', fiscalYear: 'april-march', regulatedBank: {}, unregulatedBank: {} };

function Bank({ prefix, register }: { prefix: 'regulatedBank' | 'unregulatedBank'; register: any }) {
  return (
    <>
      <Field label="Bank Name"><TextInput {...register(`${prefix}.bankName`)} placeholder="e.g. HDFC Bank" /></Field>
      <Field label="Account No"><TextInput {...register(`${prefix}.accountNo`)} /></Field>
      <Field label="Branch"><TextInput {...register(`${prefix}.branch`)} /></Field>
      <Field label="IFSC Code"><TextInput {...register(`${prefix}.ifsc`)} /></Field>
      <Field label="SWIFT Code"><TextInput {...register(`${prefix}.swift`)} /></Field>
    </>
  );
}

export function FirmForm({ open, onClose, firm }: { open: boolean; onClose: () => void; firm?: Firm | null }) {
  const currencies = useCurrencies();
  const { register, handleSubmit, control, reset, watch, setError, formState: { errors } } = useForm<Firm>({ defaultValues: empty });
  useEffect(() => { if (open) reset(firm ? { ...empty, ...firm, contactNumbers: firm.contactNumbers?.length ? firm.contactNumbers : [''], emails: firm.emails?.length ? firm.emails : [''], taxIds: firm.taxIds?.length ? firm.taxIds : empty.taxIds } : empty); }, [open, firm, reset]);
  const save = useSave({ invalidate: ['firms', 'lookup'], onSuccess: onClose });
  const submit = handleSubmit((v) => {
    const body = { ...v, contactNumbers: v.contactNumbers.filter(Boolean), emails: v.emails.filter(Boolean) };
    save.mutate({ method: firm ? 'put' : 'post', url: firm ? `/api/organizations/firms/${firm.id}` : '/api/organizations/firms', body }, { onError: (e) => applyApiErrors(e, setError as any) });
  });
  const country = watch('countryCode');
  return (
    <Modal open={open} onClose={onClose} title={firm ? 'Edit Firm' : 'Add Firm'} size="xl" footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending && <Spinner />} {firm ? 'Update' : 'Save'}</button></>}>
      <form onSubmit={submit} className="-my-6">
        <FormSection title="Basic Information" description="Legal name, country and contact details of the firm.">
          <Field label="Firm Name" required error={errors.name?.message as string} className="sm:col-span-2"><TextInput {...register('name', { required: 'Firm name is required' })} placeholder="Enter firm name" /></Field>
          <Field label="Country" required><Controller control={control} name="countryCode" render={({ field }) => <Select value={field.value} onChange={field.onChange} options={COUNTRIES} />} /></Field>
          {country === 'IN' && <Field label="GST Treatment"><Controller control={control} name="gstTreatment" render={({ field }) => <Select value={field.value} onChange={field.onChange} options={GST_TREATMENTS} />} /></Field>}
          <Field label="Website"><TextInput {...register('website')} placeholder="https://" /></Field>
          <Field label="Place of Supply"><Controller control={control} name="placeOfSupply" render={({ field }) => <Select value={field.value} onChange={field.onChange} options={INDIAN_STATES.map((s) => ({ value: s, label: s }))} />} /></Field>
          <Field label="Contact Number"><TextInput {...register('contactNumbers.0')} placeholder="+91 " /></Field>
          <Field label="Email"><TextInput {...register('emails.0')} type="email" /></Field>
        </FormSection>
        <FormSection title="Tax IDs" description="Enable the identifiers you want to print on documents.">
          {TAX_LABELS.map((label, i) => (
            <div key={label} className="flex items-center gap-3">
              <Controller control={control} name={`taxIds.${i}.enabled`} render={({ field }) => <Switch checked={!!field.value} onChange={field.onChange} />} />
              <input type="hidden" {...register(`taxIds.${i}.label`)} value={label} />
              <div className="flex-1"><label className="label">{label}</label><TextInput {...register(`taxIds.${i}.value`)} disabled={!watch(`taxIds.${i}.enabled`)} /></div>
            </div>
          ))}
        </FormSection>
        <FormSection title="Address" description="Registered office address.">
          <Field label="Address" className="sm:col-span-2"><TextInput {...register('addressLine1')} /></Field>
          <Field label="State"><Controller control={control} name="state" render={({ field }) => <Select value={field.value} onChange={field.onChange} options={INDIAN_STATES.map((s) => ({ value: s, label: s }))} />} /></Field>
          <Field label="City"><TextInput {...register('city')} /></Field>
          <Field label="Area"><TextInput {...register('area')} /></Field>
          <Field label="Pincode"><TextInput {...register('pincode')} /></Field>
          <Field label="Google Map URL" className="sm:col-span-2"><TextInput {...register('googleMapUrl')} /></Field>
        </FormSection>
        <FormSection title="Preferences" description="Currency, formats and financial year used across the firm.">
          <Field label="Currency" required><Controller control={control} name="currency" render={({ field }) => <Select value={field.value} onChange={field.onChange} options={(currencies.data ?? []).map((c: any) => ({ value: c.code, label: `${c.code} - ${c.name}` }))} />} /></Field>
          <Field label="Currency Format"><Controller control={control} name="currencyFormat" render={({ field }) => <Select value={field.value} onChange={field.onChange} options={[{ value: '1,234,567.89', label: '1,234,567.89' }, { value: '12,34,567.89', label: '12,34,567.89' }, { value: '1.234.567,89', label: '1.234.567,89' }]} />} /></Field>
          <Field label="Amount in Words Format" className="sm:col-span-2"><Controller control={control} name="amountInWordsFormat" render={({ field }) => <RadioGroup value={field.value} onChange={field.onChange} options={[{ value: 'international', label: 'International (Million, Billion)' }, { value: 'indian', label: 'Indian (Lakh, Crore)' }]} />} /></Field>
          <Field label="Time Zone" required><Controller control={control} name="timeZone" render={({ field }) => <Select value={field.value} onChange={field.onChange} options={TIMEZONES} />} /></Field>
          <Field label="Date Format"><Controller control={control} name="dateFormat" render={({ field }) => <Select value={field.value} onChange={field.onChange} options={['dd-MM-yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd'].map((v) => ({ value: v, label: v }))} />} /></Field>
          <Field label="Time Format"><Controller control={control} name="timeFormat" render={({ field }) => <Select value={field.value} onChange={field.onChange} options={[{ value: 'hh:mm tt', label: '12 hours (hh:mm AM/PM)' }, { value: 'HH:mm', label: '24 hours (HH:mm)' }]} />} /></Field>
          <Field label="Financial Year"><Controller control={control} name="fiscalYear" render={({ field }) => <Select value={field.value} onChange={field.onChange} options={[{ value: 'april-march', label: 'April - March' }, { value: 'january-december', label: 'January - December' }]} />} /></Field>
        </FormSection>
        <FormSection title="Bank Details (Regulated)" description="Printed on regulated (pakka) invoices."><Bank prefix="regulatedBank" register={register} /></FormSection>
        <FormSection title="Bank Details (Unregulated)" description="Printed on unregulated (kaccha) invoices."><Bank prefix="unregulatedBank" register={register} /></FormSection>
      </form>
    </Modal>
  );
}

export default function FirmPage() {
  const [state, setState] = useListState();
  const q = useList<Firm>('firms', '/api/organizations/firms', state);
  const [edit, setEdit] = useState<Firm | null | undefined>(undefined);
  const [del, setDel] = useState<Firm | null>(null);
  const can = useAuthStore((s) => s.can);
  const remove = useSave({ invalidate: ['firms', 'lookup'], onSuccess: () => setDel(null) });
  const columns: Column<Firm>[] = [
    { key: 'name', header: 'Firm Name', locked: true, render: (r) => <span className="flex items-center gap-2 font-medium text-gray-900">{r.name}{r.isDefault && <Badge color="blue">Default</Badge>}</span> },
    { key: 'gstin', header: 'GSTIN', render: (r) => r.taxIds?.find((t: any) => t.label === 'GSTIN' && t.enabled)?.value || r.gstin || '-' },
    { key: 'countryCode', header: 'Country' },
    { key: 'currency', header: 'Currency' },
    { key: 'city', header: 'City', render: (r) => r.city || '-' },
    { key: 'fiscalYear', header: 'Financial Year', render: (r) => (r.fiscalYear === 'april-march' ? 'April - March' : 'January - December'), hidden: true },
    { key: 'createdAt', header: 'Created At', render: (r) => fmtDate(r.createdAt, true), hidden: true },
  ];
  return (
    <>
      <h2 className="mb-4 text-[20px] font-semibold text-gray-900">Firm</h2>
      <DataTable
        storageKey="firms"
        columns={columns}
        rows={q.data?.rows ?? []}
        total={q.data?.total}
        loading={q.isFetching}
        state={state}
        onStateChange={setState}
        rowKey={(r) => r.id}
        onRefresh={() => q.refetch()}
        onRowClick={(r) => can('admin_firms', 'update') && setEdit(r)}
        actions={can('admin_firms', 'create') && <button className="btn-primary" onClick={() => setEdit(null)}><Plus className="h-4 w-4" /> Add Firm</button>}
        rowActions={(r) => (
          <span className="inline-flex gap-1">
            <button className="icon-btn h-7 w-7" onClick={() => setEdit(r)}><Pencil className="h-3.5 w-3.5" /></button>
            {!r.isDefault && can('admin_firms', 'delete') && <button className="icon-btn h-7 w-7 text-red-600" onClick={() => setDel(r)}><Trash2 className="h-3.5 w-3.5" /></button>}
          </span>
        )}
      />
      <FirmForm open={edit !== undefined} onClose={() => setEdit(undefined)} firm={edit} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} loading={remove.isPending} title="Delete firm?" message={<>Delete <b>{del?.name}</b>? All its branches and data will be removed.</>} onConfirm={() => del && remove.mutate({ method: 'delete', url: `/api/organizations/firms/${del.id}` })} />
    </>
  );
}
