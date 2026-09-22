import { useEffect, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Copy, Pencil, Plus, Trash2, X } from 'lucide-react';
import { CONTACT_TYPES, CONTACT_TYPE_LABELS, type FilterFieldDef } from '@diamondbill/shared';
import { DataTable, useListState, type Column } from '@/components/data/DataTable';
import { CustomFieldInputs } from '@/components/data/CustomFieldInputs';
import { Badge, Checkbox, Combobox, ConfirmDialog, Field, FormSection, Modal, RadioGroup, Select, Spinner, Tabs, TextArea, TextInput } from '@/components/ui';
import { api } from '@/lib/api';
import { applyApiErrors, useFirms, useList, useSave, useSettings, useUsersLookup } from '@/lib/queries';
import { useAuthStore } from '@/store/auth';
import { fmtDate } from '@/lib/format';
import { INDIAN_STATES } from '@/pages/settings/FirmPage';

const PHONE_CODES = ['+91', '+1', '+971', '+852', '+32', '+972', '+44'];
const GST_TREATMENTS = [{ value: 'registered_regular', label: 'Registered Business - Regular' }, { value: 'registered_composition', label: 'Registered Business - Composition' }, { value: 'unregistered', label: 'Unregistered Business' }, { value: 'consumer', label: 'Consumer' }, { value: 'overseas', label: 'Overseas' }, { value: 'sez', label: 'Special Economic Zone' }];
const emptyAddr = { address: '', companyName: '', mobile: '', gstin: '', country: 'IN', state: '', city: '', area: '', pincode: '', googleMapUrl: '' };
const defaults = { firmId: '', contactType: 'customer', companyName: '', contactPerson: '', phoneCode: '+91', phone: '', email: '', serialNo: '', gstin: '', gstTreatment: 'unregistered', billingAddress: { ...emptyAddr }, shippingAddresses: [] as any[], bankName: '', accountNo: '', bankBranch: '', ifscCode: '', swiftCode: '', contactPersons: [] as any[], dob: '', salesPersonId: '', referenceContactId: '', discountType: 'fixed', discountValue: '', paymentTermDays: '', paymentTermName: '', brokerageValue: '', creditLimitAmount: '', notes: '', customFields: {} as Record<string, any> };

function AddressFields({ prefix, register, control }: { prefix: string; register: any; control: any }) {
  return (
    <>
      <Field label="Address" className="sm:col-span-2"><TextArea {...register(`${prefix}.address`)} className="min-h-[60px]" /></Field>
      <Field label="Country"><Controller control={control} name={`${prefix}.country`} render={({ field }) => <Select value={field.value} onChange={field.onChange} options={[{ value: 'IN', label: 'India' }, { value: 'US', label: 'United States' }, { value: 'AE', label: 'UAE' }, { value: 'HK', label: 'Hong Kong' }, { value: 'BE', label: 'Belgium' }, { value: 'IL', label: 'Israel' }]} />} /></Field>
      <Field label="State"><Controller control={control} name={`${prefix}.state`} render={({ field }) => <Combobox value={field.value} onChange={field.onChange} options={INDIAN_STATES.map((s) => ({ value: s, label: s }))} />} /></Field>
      <Field label="City"><TextInput {...register(`${prefix}.city`)} /></Field>
      <Field label="Area"><TextInput {...register(`${prefix}.area`)} /></Field>
      <Field label="Pincode"><TextInput {...register(`${prefix}.pincode`)} /></Field>
      <Field label="Google Map URL"><TextInput {...register(`${prefix}.googleMapUrl`)} /></Field>
    </>
  );
}

export function ContactForm({ open, onClose, row, onSaved }: { open: boolean; onClose: () => void; row?: any | null; onSaved?: (c: any) => void }) {
  const firms = useFirms();
  const users = useUsersLookup();
  const settings = useSettings();
  const contacts = useQuery({ queryKey: ['lookup', 'contacts', 'all'], queryFn: () => api.get<any[]>('/api/crm/lookup/contacts'), enabled: open });
  const nextSerial = useQuery({ queryKey: ['contacts', 'next-serial'], queryFn: () => api.get<{ serialNo: number }>('/api/crm/contacts/next-serial'), enabled: open && !row });
  const [tab, setTab] = useState('basic');
  const { register, handleSubmit, control, reset, watch, setValue, getValues, setError, formState: { errors } } = useForm<any>({ defaultValues: defaults });
  const ship = useFieldArray({ control, name: 'shippingAddresses' });
  const persons = useFieldArray({ control, name: 'contactPersons' });
  useEffect(() => { if (open) { setTab('basic'); reset(row ? { ...defaults, ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v ?? ''])), billingAddress: { ...emptyAddr, ...(row.billingAddress ?? {}) }, shippingAddresses: row.shippingAddresses ?? [], contactPersons: row.contactPersons ?? [], customFields: row.customFields ?? {}, dob: row.dob ? String(row.dob).slice(0, 10) : '' } : { ...defaults, firmId: firms.data?.find((f) => f.isDefault)?.id ?? '' }); } }, [open, row]); // eslint-disable-line
  useEffect(() => { if (open && !row && nextSerial.data) setValue('serialNo', String(nextSerial.data.serialNo)); }, [nextSerial.data, open, row, setValue]);
  const save = useSave({ invalidate: ['contacts', 'lookup'], onSuccess: (c) => { onSaved?.(c); onClose(); } });
  const num = (v: any) => (v === '' || v == null ? null : Number(v));
  const submit = handleSubmit((v) => {
    const body = { ...v, firmId: v.firmId || null, email: v.email || '', serialNo: v.serialNo ? String(v.serialNo) : null, dob: v.dob || null, salesPersonId: v.salesPersonId || null, referenceContactId: v.referenceContactId || null, discountValue: num(v.discountValue), paymentTermDays: num(v.paymentTermDays), brokerageValue: num(v.brokerageValue), creditLimitAmount: num(v.creditLimitAmount) };
    save.mutate({ method: row ? 'put' : 'post', url: row ? `/api/crm/contacts/${row.id}` : '/api/crm/contacts', body }, { onError: (e) => { applyApiErrors(e, setError as any); setTab('basic'); } });
  });
  const ctype = watch('contactType');
  const s = settings.data ?? {};
  const isBroker = ctype === 'broker';
  return (
    <Modal open={open} onClose={onClose} title={row ? `Edit Contact — ${row.companyName}` : 'New Contact'} size="xl" footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending && <Spinner />} {row ? 'Update' : 'Save'}</button></>}>
      <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[{ value: 'basic', label: 'Basic' }, { value: 'address', label: 'Address' }, { value: 'bank', label: 'Bank Details' }, { value: 'persons', label: 'Contact Persons', count: persons.fields.length }, { value: 'other', label: 'Other Details' }]} />
      <form onSubmit={submit} className="-my-6">
        <div className={tab !== 'basic' ? 'hidden' : ''}>
          <FormSection title="Contact Type" description="Determines where this contact appears (sales, purchase, brokerage).">
            <div className="sm:col-span-2"><Controller control={control} name="contactType" render={({ field }) => <RadioGroup value={field.value} onChange={field.onChange} options={CONTACT_TYPES.filter((t) => !(s.hideBrokerFields && t === 'broker')).map((t) => ({ value: t, label: CONTACT_TYPE_LABELS[t] }))} />} /></div>
          </FormSection>
          <FormSection title="Basic Information">
            {s.contactIsFirmwise && <Field label="Firm" required className="sm:col-span-2"><Controller control={control} name="firmId" render={({ field }) => <Select value={field.value} onChange={field.onChange} options={(firms.data ?? []).map((f) => ({ value: f.id, label: f.name }))} />} /></Field>}
            <Field label="Serial No" hint="Auto-generated; edit if needed"><TextInput {...register('serialNo')} /></Field>
            <Field label="Company / Display Name" required error={errors.companyName?.message as string}><TextInput {...register('companyName', { required: 'Required' })} /></Field>
            <Field label="Contact Person"><TextInput {...register('contactPerson')} /></Field>
            <Field label="Mobile" required={s.contactMobileCompulsory !== false} error={errors.phone?.message as string}>
              <div className="flex gap-2">
                <Controller control={control} name="phoneCode" render={({ field }) => <Select value={field.value} onChange={field.onChange} className="w-[96px]" placeholder="" options={PHONE_CODES.map((c) => ({ value: c, label: c }))} />} />
                <TextInput {...register('phone', { required: s.contactMobileCompulsory === false ? false : 'Mobile is required' })} placeholder="98765 43210" />
              </div>
            </Field>
            <Field label="Email" error={errors.email?.message as string}><TextInput type="email" {...register('email')} /></Field>
            <Field label="Date of Birth"><TextInput type="date" {...register('dob')} /></Field>
          </FormSection>
          <FormSection title="GST Details">
            <Field label="GST Treatment"><Controller control={control} name="gstTreatment" render={({ field }) => <Select value={field.value} onChange={field.onChange} options={GST_TREATMENTS} />} /></Field>
            <Field label="GSTIN"><TextInput {...register('gstin')} placeholder="24AAAAA0000A1Z5" className="uppercase" /></Field>
          </FormSection>
          <FormSection title="Custom Fields">
            <div className="sm:col-span-2"><Controller control={control} name="customFields" render={({ field }) => <CustomFieldInputs moduleName="contacts" value={field.value} onChange={field.onChange} />} /></div>
          </FormSection>
        </div>
        <div className={tab !== 'address' ? 'hidden' : ''}>
          <FormSection title="Billing Address"><AddressFields prefix="billingAddress" register={register} control={control} /></FormSection>
          <div className="py-6">
            <div className="flex items-center justify-between mb-3"><h4 className="text-[15px] font-semibold text-gray-900">Shipping Addresses</h4><div className="flex gap-2"><button type="button" className="btn-outline" onClick={() => ship.append({ ...getValues('billingAddress') })}><Copy className="h-4 w-4" /> Copy Billing</button><button type="button" className="btn-outline-primary" onClick={() => ship.append({ ...emptyAddr })}><Plus className="h-4 w-4" /> Add</button></div></div>
            {ship.fields.length === 0 && <p className="text-[13px] text-gray-500">No shipping address. Billing address will be used.</p>}
            {ship.fields.map((f, i) => (
              <div key={f.id} className="relative mb-3 grid gap-4 rounded-lg border border-line p-4 sm:grid-cols-2">
                <button type="button" className="absolute right-2 top-2 icon-btn h-7 w-7 text-red-600" onClick={() => ship.remove(i)}><X className="h-3.5 w-3.5" /></button>
                <Field label="Company Name (on label)"><TextInput {...register(`shippingAddresses.${i}.companyName`)} /></Field>
                <Field label="Mobile"><TextInput {...register(`shippingAddresses.${i}.mobile`)} /></Field>
                <Field label="GSTIN"><TextInput {...register(`shippingAddresses.${i}.gstin`)} /></Field>
                <AddressFields prefix={`shippingAddresses.${i}`} register={register} control={control} />
              </div>
            ))}
          </div>
        </div>
        <div className={tab !== 'bank' ? 'hidden' : ''}>
          <FormSection title="Bank Details" description="Used on payment vouchers and remittance notes.">
            <Field label="Bank Name"><TextInput {...register('bankName')} /></Field>
            <Field label="Account No"><TextInput {...register('accountNo')} /></Field>
            <Field label="Branch"><TextInput {...register('bankBranch')} /></Field>
            <Field label="IFSC Code"><TextInput {...register('ifscCode')} /></Field>
            <Field label="SWIFT Code"><TextInput {...register('swiftCode')} /></Field>
          </FormSection>
        </div>
        <div className={tab !== 'persons' ? 'hidden' : ''}>
          <div className="py-6">
            <div className="flex items-center justify-between mb-3"><h4 className="text-[15px] font-semibold text-gray-900">Contact Persons</h4><button type="button" className="btn-outline-primary" onClick={() => persons.append({ name: '', mobile: '', isWhatsapp: false, email: '', designation: '', notes: '' })}><Plus className="h-4 w-4" /> Add Person</button></div>
            {persons.fields.length === 0 && <p className="text-[13px] text-gray-500">No contact persons added.</p>}
            {persons.fields.map((f, i) => (
              <div key={f.id} className="relative mb-3 grid gap-4 rounded-lg border border-line p-4 sm:grid-cols-3">
                <button type="button" className="absolute right-2 top-2 icon-btn h-7 w-7 text-red-600" onClick={() => persons.remove(i)}><X className="h-3.5 w-3.5" /></button>
                <Field label="Name" required><TextInput {...register(`contactPersons.${i}.name`, { required: true })} /></Field>
                <Field label="Mobile"><TextInput {...register(`contactPersons.${i}.mobile`)} /></Field>
                <Field label="Email"><TextInput type="email" {...register(`contactPersons.${i}.email`)} /></Field>
                <Field label="Designation"><TextInput {...register(`contactPersons.${i}.designation`)} /></Field>
                <Field label="Notes"><TextInput {...register(`contactPersons.${i}.notes`)} /></Field>
                <div className="flex items-end pb-2"><Controller control={control} name={`contactPersons.${i}.isWhatsapp`} render={({ field }) => <Checkbox checked={!!field.value} onChange={field.onChange} label="WhatsApp number" />} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className={tab !== 'other' ? 'hidden' : ''}>
          <FormSection title="Sales & Terms">
            <Field label="Sales Person"><Controller control={control} name="salesPersonId" render={({ field }) => <Combobox value={field.value} onChange={field.onChange} options={(users.data ?? []).map((u) => ({ value: u.id, label: u.name }))} />} /></Field>
            <Field label="Reference Contact"><Controller control={control} name="referenceContactId" render={({ field }) => <Combobox value={field.value} onChange={field.onChange} options={(contacts.data ?? []).filter((c) => c.id !== row?.id).map((c) => ({ value: c.id, label: c.display ?? c.companyName }))} />} /></Field>
            <Field label="Payment Terms (days)"><TextInput type="number" {...register('paymentTermDays')} placeholder="e.g. 30" /></Field>
            <Field label="Payment Term Name"><TextInput {...register('paymentTermName')} placeholder="Net 30" /></Field>
            <Field label="Discount">
              <div className="flex gap-2">
                <Controller control={control} name="discountType" render={({ field }) => <Select value={field.value} onChange={field.onChange} className="w-[110px]" placeholder="" options={[{ value: 'fixed', label: 'Fixed' }, { value: 'percent', label: '%' }]} />} />
                <TextInput type="number" step="any" {...register('discountValue')} />
              </div>
            </Field>
            {s.customerCreditLimit && <Field label="Credit Limit Amount"><TextInput type="number" step="any" {...register('creditLimitAmount')} /></Field>}
            {(isBroker || !s.hideBrokerFields) && <Field label="Brokerage (%)"><TextInput type="number" step="any" {...register('brokerageValue')} /></Field>}
          </FormSection>
          <FormSection title="Notes"><Field className="sm:col-span-2"><TextArea {...register('notes')} /></Field></FormSection>
        </div>
      </form>
    </Modal>
  );
}

const filterFields: FilterFieldDef[] = [
  { key: 'companyName', label: 'Contact', type: 'text' },
  { key: 'contactPerson', label: 'Contact Person', type: 'text' },
  { key: 'contactType', label: 'Type', type: 'select', options: CONTACT_TYPES.map((t) => ({ value: t, label: CONTACT_TYPE_LABELS[t] })) },
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'phone', label: 'Mobile', type: 'text' },
  { key: 'gstin', label: 'GSTIN', type: 'text' },
  { key: 'gstTreatment', label: 'GST Treatment', type: 'select', options: GST_TREATMENTS },
  { key: 'city', label: 'City', type: 'text' },
  { key: 'state', label: 'State', type: 'text' },
  { key: 'serialNo', label: 'Serial No', type: 'number' },
  { key: 'paymentTermDays', label: 'Payment Terms (days)', type: 'number' },
  { key: 'dob', label: 'DOB', type: 'date' },
  { key: 'createdAt', label: 'Created At', type: 'date' },
];

export default function ContactsPage() {
  const [state, setState] = useListState({ sortBy: 'createdAt' });
  const [type, setType] = useState('');
  const q = useList<any>('contacts', '/api/crm/contacts', state, { contactType: type });
  const [edit, setEdit] = useState<any | null | undefined>(undefined);
  const [del, setDel] = useState<any | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const can = useAuthStore((s) => s.can);
  const remove = useSave({ invalidate: ['contacts', 'lookup'], onSuccess: () => setDel(null) });
  const typeColor: Record<string, any> = { customer: 'green', vendor: 'amber', customer_vendor: 'purple', broker: 'blue', contact: 'gray' };
  const columns: Column<any>[] = [
    { key: 'serialNo', header: 'Sr. No', width: 80, render: (r) => r.serialNo },
    { key: 'companyName', header: 'Company / Name', locked: true, render: (r) => (<div><div className="font-medium text-gray-900">{r.companyName}</div>{r.contactPerson && <div className="text-[12px] text-gray-500">{r.contactPerson}</div>}</div>) },
    { key: 'contactType', header: 'Type', render: (r) => <Badge color={typeColor[r.contactType]}>{r.contactTypeLabel}</Badge> },
    { key: 'phone', header: 'Mobile', render: (r) => (r.phone ? `${r.phoneCode ?? ''} ${r.phoneMasked}` : '-') },
    { key: 'email', header: 'Email', render: (r) => r.email || '-' },
    { key: 'gstin', header: 'GSTIN', render: (r) => r.gstin || '-' },
    { key: 'city', header: 'City', render: (r) => r.billingAddress?.city || '-', hidden: true },
    { key: 'paymentTermDays', header: 'Payment Terms', render: (r) => (r.paymentTermDays != null ? `${r.paymentTermDays} days` : '-'), hidden: true },
    { key: 'createdAt', header: 'Created At', render: (r) => fmtDate(r.createdAt, true), hidden: true },
  ];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[20px] font-semibold text-gray-900">Contacts</h2>
      </div>
      <DataTable storageKey="contacts" searchPlaceholder="Search by name, email, company, mobile, contact person..." filterFields={filterFields} columns={columns} rows={q.data?.rows ?? []} total={q.data?.total} loading={q.isFetching} state={state} onStateChange={setState} rowKey={(r) => r.id} onRefresh={() => q.refetch()} selectable selected={selected} onSelectedChange={setSelected} onImport={() => {}}
        onRowClick={(r) => can('crm_contacts', 'update') && setEdit(r)}
        toolbar={<Select size="sm" className="w-[190px]" value={type} onChange={setType} placeholder="All Types" options={CONTACT_TYPES.map((t) => ({ value: t, label: CONTACT_TYPE_LABELS[t] }))} />}
        actions={can('crm_contacts', 'create') && <button className="btn-primary" onClick={() => setEdit(null)}><Plus className="h-4 w-4" /> New Contact</button>}
        rowActions={(r) => (<span className="inline-flex gap-1"><button className="icon-btn h-7 w-7" onClick={() => setEdit(r)}><Pencil className="h-3.5 w-3.5" /></button>{can('crm_contacts', 'delete') && <button className="icon-btn h-7 w-7 text-red-600" onClick={() => setDel(r)}><Trash2 className="h-3.5 w-3.5" /></button>}</span>)}
        emptyTitle="No contacts yet" emptyDescription="Add customers, vendors and brokers to start billing." />
      <ContactForm open={edit !== undefined} onClose={() => setEdit(undefined)} row={edit} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} loading={remove.isPending} title="Delete contact?" message={<>Delete <b>{del?.companyName}</b>?</>} onConfirm={() => del && remove.mutate({ method: 'delete', url: `/api/crm/contacts/${del.id}` })} />
    </>
  );
}
