import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ListPlus } from 'lucide-react';
import { LAB_TYPES, LAB_TYPE_LABELS, PRODUCT_STOCK_TYPES, PRODUCT_STOCK_TYPE_LABELS, PROCESS_BEHAVIORS, TAX_TYPES, TDS_SECTIONS, TCS_SECTIONS, TERMS_DOCUMENT_TYPES, UQC_CODES } from '@diamondbill/shared';
import { MasterPage, type MasterConfig } from '@/components/data/MasterPage';
import { Badge, Field, Modal, Select, Spinner, TextArea, TextInput } from '@/components/ui';
import { api } from '@/lib/api';
import { useFirms, useSave, useUsersLookup } from '@/lib/queries';
import { fmtDate } from '@/lib/format';

const M = '/api/accounting/masters';
const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const useLedgers = (subs: string) => useQuery({ queryKey: ['ledgers', subs], queryFn: () => api.get<any[]>(`/api/accounting/chart-of-accounts/ledgers?accountSubTypes=${subs}`), staleTime: 60_000 });
const useMasters = () => useQuery({ queryKey: ['lookup-masters'], queryFn: () => api.get<any>('/api/common/lookups/masters'), staleTime: 60_000 });

/* ====================== Taxes ====================== */
export function TaxesPage() {
  const [tab, setTab] = useState<'individual' | 'composite'>('individual');
  const masters = useMasters();
  const cfg: MasterConfig = {
    title: 'Taxes', label: 'Tax', url: `${M}/tax-groups`, permission: 'acc_taxes', queryKey: 'tax-groups',
    filters: { isComposite: tab === 'composite' },
    columns: [
      { key: 'name', header: 'Tax Name', render: (r) => <span className="flex items-center gap-2 font-medium text-gray-900">{r.name}{r.isSystem && <Badge>System</Badge>}</span> },
      { key: 'taxType', header: 'Tax Type', render: (r) => titleCase(r.taxType) },
      { key: 'gstCategory', header: 'GST Category', render: (r) => (r.taxType === 'gst' ? (r.gstCategory === 'intra_state' ? 'Intra State (CGST + SGST)' : 'Inter State (IGST)') : '-') },
      { key: 'cgstRate', header: 'CGST %', align: 'right', render: (r) => (r.gstCategory === 'intra_state' ? r.cgstRate : '-') },
      { key: 'sgstRate', header: 'SGST %', align: 'right', render: (r) => (r.gstCategory === 'intra_state' ? r.sgstRate : '-') },
      { key: 'igstRate', header: 'IGST %', align: 'right', render: (r) => (r.gstCategory === 'inter_state' ? r.igstRate : '-') },
      { key: 'cessRate', header: 'Cess %', align: 'right', hidden: true },
      { key: 'rate', header: 'Effective Rate', align: 'right', render: (r) => <span className="font-medium">{r.rate}%</span> },
      { key: 'isActive', header: 'Status', render: (r) => (r.isActive ? <Badge color="green">Active</Badge> : <Badge>Inactive</Badge>) },
    ],
    defaults: { name: '', taxType: 'gst', gstCategory: 'intra_state', cgstRate: '', sgstRate: '', igstRate: '', cessRate: '', rate: '', remark: '', isActive: true, isComposite: tab === 'composite', componentIds: [] },
    fields: [
      { name: 'name', label: 'Tax Name', required: true, placeholder: 'GST 3%' },
      { name: 'taxType', label: 'Tax Type', type: 'select', required: true, options: TAX_TYPES.map((t) => ({ value: t, label: titleCase(t) })), visible: (v) => !v.isComposite },
      { name: 'gstCategory', label: 'GST Category', type: 'select', required: true, options: [{ value: 'intra_state', label: 'Intra State (CGST + SGST)' }, { value: 'inter_state', label: 'Inter State (IGST)' }], visible: (v) => v.taxType === 'gst' && !v.isComposite },
      { name: 'cgstRate', label: 'CGST %', type: 'number', required: true, visible: (v) => v.taxType === 'gst' && v.gstCategory === 'intra_state' && !v.isComposite },
      { name: 'sgstRate', label: 'SGST %', type: 'number', required: true, visible: (v) => v.taxType === 'gst' && v.gstCategory === 'intra_state' && !v.isComposite },
      { name: 'igstRate', label: 'IGST %', type: 'number', required: true, visible: (v) => v.taxType === 'gst' && v.gstCategory === 'inter_state' && !v.isComposite },
      { name: 'cessRate', label: 'Cess %', type: 'number', visible: (v) => v.taxType === 'gst' && !v.isComposite },
      { name: 'rate', label: 'Rate %', type: 'number', required: true, visible: (v) => v.taxType !== 'gst' && v.taxType !== 'out_of_scope' && !v.isComposite },
      { name: 'componentIds', label: 'Taxes in this group', type: 'multi', required: true, span: 2, options: () => (masters.data?.taxGroups ?? []).map((t: any) => ({ value: t.id, label: `${t.name} (${t.rate}%)` })), visible: (v) => v.isComposite, hint: 'Effective rate = sum of component rates' },
      { name: 'remark', label: 'Remark', type: 'textarea' },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    toBody: (v) => {
      const num = (x: any) => (x === '' || x == null ? 0 : Number(x));
      if (v.isComposite) {
        const comps = (masters.data?.taxGroups ?? []).filter((t: any) => v.componentIds.includes(t.id));
        return { ...v, taxType: 'gst', rate: comps.reduce((s: number, t: any) => s + Number(t.rate), 0), cgstRate: 0, sgstRate: 0, igstRate: 0, cessRate: 0 };
      }
      return { ...v, cgstRate: num(v.cgstRate), sgstRate: num(v.sgstRate), igstRate: num(v.igstRate), cessRate: num(v.cessRate), rate: num(v.rate) };
    },
    canDelete: (r) => !r.isSystem, canEdit: (r) => !r.isSystem, modalSize: 'md',
    toolbar: (
      <div className="flex rounded-lg border border-line p-0.5 text-[13px]">
        {(['individual', 'composite'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1 ${tab === t ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{t === 'individual' ? 'Individual Taxes' : 'Composite Tax Groups'}</button>
        ))}
      </div>
    ),
  };
  return <MasterPage key={tab} cfg={cfg} />;
}

/* ====================== TDS / TCS ====================== */
function WithholdingPage({ kind }: { kind: 'tds' | 'tcs' }) {
  const payable = useLedgers('other_current_liability,accounts_payable');
  const receivable = useLedgers('other_current_asset,accounts_receivable');
  const sections = kind === 'tds' ? TDS_SECTIONS : TCS_SECTIONS;
  const cfg: MasterConfig = {
    title: kind === 'tds' ? 'TDS Settings' : 'TCS Rates', label: kind.toUpperCase() + ' Rate', url: `${M}/${kind}-rates`, permission: kind === 'tds' ? 'acc_tds_settings' : 'acc_tcs_rates', queryKey: `${kind}-rates`,
    columns: [
      { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-gray-900">{r.name}</span> },
      { key: 'section', header: 'Section' },
      { key: 'rate', header: 'Rate %', align: 'right' },
      { key: 'payableAccountId', header: 'Payable Account', render: (r) => payable.data?.find((a) => a.id === r.payableAccountId)?.name ?? '-' },
      { key: 'receivableAccountId', header: 'Receivable Account', render: (r) => receivable.data?.find((a) => a.id === r.receivableAccountId)?.name ?? '-' },
      { key: 'effectiveFrom', header: 'Effective From', render: (r) => fmtDate(r.effectiveFrom) },
      { key: 'effectiveTo', header: 'Effective To', render: (r) => fmtDate(r.effectiveTo) },
      { key: 'isActive', header: 'Status', render: (r) => (r.isActive ? <Badge color="green">Active</Badge> : <Badge>Inactive</Badge>) },
    ],
    defaults: { name: '', section: '', rate: '', payableAccountId: '', receivableAccountId: '', effectiveFrom: '', effectiveTo: '', isActive: true },
    fields: [
      { name: 'name', label: 'Name', required: true, placeholder: kind === 'tds' ? 'TDS on Contractor 1%' : 'TCS on Sale of Goods 0.1%' },
      { name: 'section', label: 'Section', type: 'combobox', required: true, options: sections.map((s) => ({ value: s, label: s })) },
      { name: 'rate', label: 'Rate %', type: 'number', required: true },
      { name: 'payableAccountId', label: 'Payable Account', type: 'combobox', options: () => (payable.data ?? []).map((a) => ({ value: a.id, label: a.name, sub: a.subTypeLabel })) },
      { name: 'receivableAccountId', label: 'Receivable Account', type: 'combobox', options: () => (receivable.data ?? []).map((a) => ({ value: a.id, label: a.name, sub: a.subTypeLabel })) },
      { name: 'effectiveFrom', label: 'Effective From', type: 'date' },
      { name: 'effectiveTo', label: 'Effective To', type: 'date' },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    toForm: (r) => ({ ...r, payableAccountId: r.payableAccountId ?? '', receivableAccountId: r.receivableAccountId ?? '', effectiveFrom: r.effectiveFrom ?? '', effectiveTo: r.effectiveTo ?? '' }),
    toBody: (v) => ({ ...v, rate: Number(v.rate), payableAccountId: v.payableAccountId || null, receivableAccountId: v.receivableAccountId || null }),
  };
  return <MasterPage cfg={cfg} />;
}
export const TdsPage = () => <WithholdingPage kind="tds" />;
export const TcsPage = () => <WithholdingPage kind="tcs" />;

/* ====================== Units ====================== */
export function UnitsPage() {
  const masters = useMasters();
  const cfg: MasterConfig = {
    title: 'Units', label: 'Unit', url: `${M}/units`, permission: 'acc_units', queryKey: 'units',
    columns: [
      { key: 'name', header: 'Unit Name', render: (r) => <span className="flex items-center gap-2 font-medium text-gray-900">{r.name}{r.isSystem && <Badge>System</Badge>}</span> },
      { key: 'uqcCode', header: 'UQC Code', render: (r) => <span className="font-mono">{r.uqcCode}</span> },
      { key: 'decimalPlaces', header: 'Decimals', align: 'right' },
      { key: 'conversions', header: 'Conversions', render: (r) => (r.conversions?.length ? r.conversions.map((c: any) => `1 ${r.name} = ${c.factor} ${masters.data?.units.find((u: any) => u.id === c.toUnitId)?.name ?? '?'}`).join(', ') : '-') },
      { key: 'isActive', header: 'Status', render: (r) => (r.isActive ? <Badge color="green">Active</Badge> : <Badge>Inactive</Badge>) },
    ],
    defaults: { name: '', uqcCode: '', decimalPlaces: 2, conversions: [], isActive: true },
    fields: [
      { name: 'name', label: 'Unit Name', required: true, placeholder: 'Carat' },
      { name: 'uqcCode', label: 'UQC Code', type: 'combobox', required: true, options: UQC_CODES.map((u) => ({ value: u.code, label: u.code, sub: u.label })) },
      { name: 'decimalPlaces', label: 'Decimal Places', type: 'number' },
      { name: 'isActive', label: 'Active', type: 'switch' },
      {
        name: 'conversions', label: 'Conversions', type: 'custom', span: 2,
        render: (form, row) => {
          const list: { toUnitId: string; factor: number | string }[] = form.watch('conversions') ?? [];
          const set = (l: any[]) => form.setValue('conversions', l);
          const others = (masters.data?.units ?? []).filter((u: any) => u.id !== row?.id);
          return (
            <div>
              <div className="flex items-center justify-between mb-2"><label className="label mb-0">Conversions</label><button type="button" className="link text-[13px]" onClick={() => set([...list, { toUnitId: '', factor: '' }])}>+ Add conversion</button></div>
              {list.length === 0 && <p className="text-[12px] text-gray-500">e.g. 1 Carat = 0.2 Grams</p>}
              {list.map((c, i) => (
                <div key={i} className="mb-2 flex items-center gap-2 text-[13px]">
                  <span className="text-gray-500 whitespace-nowrap">1 {form.watch('name') || 'unit'} =</span>
                  <TextInput size="sm" type="number" step="any" value={c.factor} onChange={(e) => set(list.map((x, j) => (j === i ? { ...x, factor: e.target.value } : x)))} className="w-[110px]" />
                  <Select size="sm" value={c.toUnitId} onChange={(v) => set(list.map((x, j) => (j === i ? { ...x, toUnitId: v } : x)))} options={others.map((u: any) => ({ value: u.id, label: u.name }))} className="w-[160px]" />
                  <button type="button" className="text-red-600 text-[12px]" onClick={() => set(list.filter((_, j) => j !== i))}>Remove</button>
                </div>
              ))}
            </div>
          );
        },
      },
    ],
    toBody: (v) => ({ ...v, decimalPlaces: Number(v.decimalPlaces), conversions: (v.conversions ?? []).filter((c: any) => c.toUnitId && c.factor !== '').map((c: any) => ({ toUnitId: c.toUnitId, factor: Number(c.factor) })) }),
    canDelete: (r) => !r.isSystem,
  };
  return <MasterPage cfg={cfg} />;
}

/* ====================== Categories ====================== */
export function CategoriesPage() {
  const masters = useMasters();
  const [bulk, setBulk] = useState(false);
  const [names, setNames] = useState('');
  const [parent, setParent] = useState('');
  const save = useSave({ invalidate: ['product-categories', 'lookup-masters'], onSuccess: () => { setBulk(false); setNames(''); } });
  const cats = masters.data?.categories ?? [];
  const cfg: MasterConfig = {
    title: 'Category', label: 'Category', url: `${M}/product-categories`, permission: 'acc_categories', queryKey: 'product-categories',
    columns: [
      { key: 'serialNo', header: 'Serial', width: 80, align: 'center' },
      { key: 'name', header: 'Category Name', render: (r) => <span className="font-medium text-gray-900">{r.name}</span> },
      { key: 'parentId', header: 'Parent Category', render: (r) => cats.find((c: any) => c.id === r.parentId)?.name ?? '-' },
      { key: 'isActive', header: 'Status', render: (r) => (r.isActive ? <Badge color="green">Active</Badge> : <Badge>Inactive</Badge>) },
    ],
    defaults: { name: '', serialNo: '', parentId: '', isActive: true },
    fields: [
      { name: 'name', label: 'Category Name', required: true },
      { name: 'serialNo', label: 'Serial', type: 'number', required: true },
      { name: 'parentId', label: 'Parent Category', type: 'combobox', options: () => cats.map((c: any) => ({ value: c.id, label: c.name })) },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    toForm: (r) => ({ ...r, parentId: r.parentId ?? '' }),
    toBody: (v) => ({ ...v, serialNo: Number(v.serialNo) || 1, parentId: v.parentId || null }),
    extraActions: <button className="btn-outline-primary" onClick={() => setBulk(true)}><ListPlus className="h-4 w-4" /> Add Multiple</button>,
  };
  return (
    <>
      <MasterPage cfg={cfg} />
      <Modal open={bulk} onClose={() => setBulk(false)} size="sm" title="Add Multiple Categories" footer={<><button className="btn-outline" onClick={() => setBulk(false)}>Cancel</button><button className="btn-primary" disabled={save.isPending || !names.trim()} onClick={() => save.mutate({ method: 'post', url: `${M}/product-categories/bulk`, body: { names: names.split('\n').map((s) => s.trim()).filter(Boolean), parentId: parent || null } })}>{save.isPending && <Spinner />} Save</button></>}>
        <Field label="Category names" required hint="One per line"><TextArea value={names} onChange={(e) => setNames(e.target.value)} placeholder={'Round\nPrincess\nFancy'} className="min-h-[140px]" /></Field>
        <Field label="Parent Category" className="mt-3"><Select value={parent} onChange={setParent} placeholder="None" options={cats.map((c: any) => ({ value: c.id, label: c.name }))} /></Field>
      </Modal>
    </>
  );
}

/* ====================== Labs ====================== */
export function LabsPage() {
  const vendors = useQuery({ queryKey: ['lookup', 'contacts', 'vendors'], queryFn: () => api.get<any[]>('/api/crm/lookup/contacts?contactType=vendor&contactType=customer_vendor'), staleTime: 60_000 });
  const cfg: MasterConfig = {
    title: 'Lab', label: 'Lab', url: `${M}/labs`, permission: 'acc_labs', queryKey: 'labs',
    columns: [
      { key: 'labName', header: 'Lab Name', render: (r) => <span className="font-medium text-gray-900">{r.labName}</span> },
      { key: 'labType', header: 'Lab Type', render: (r) => <Badge color="blue">{LAB_TYPE_LABELS[r.labType as keyof typeof LAB_TYPE_LABELS] ?? r.labType}</Badge> },
      { key: 'defaultVendorId', header: 'Default Vendor', render: (r) => vendors.data?.find((v) => v.id === r.defaultVendorId)?.display ?? '-' },
      { key: 'isActive', header: 'Status', render: (r) => (r.isActive ? <Badge color="green">Active</Badge> : <Badge>Inactive</Badge>) },
    ],
    defaults: { labType: 'gia', labName: '', defaultVendorId: '', isActive: true },
    fields: [
      { name: 'labType', label: 'Lab Type', type: 'select', required: true, options: LAB_TYPES.map((t) => ({ value: t, label: LAB_TYPE_LABELS[t] })) },
      { name: 'labName', label: 'Lab Name', required: true, placeholder: 'GIA Mumbai' },
      { name: 'defaultVendorId', label: 'Default Vendor', type: 'combobox', span: 2, hint: 'Vendor used for lab issue / return bills', options: () => (vendors.data ?? []).map((v) => ({ value: v.id, label: v.display ?? v.companyName })) },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    toForm: (r) => ({ ...r, defaultVendorId: r.defaultVendorId ?? '' }),
    toBody: (v) => ({ ...v, defaultVendorId: v.defaultVendorId || null }),
  };
  return <MasterPage cfg={cfg} />;
}

/* ====================== Sales persons ====================== */
export function SalesPersonsPage() {
  const firms = useFirms();
  const users = useUsersLookup();
  const [bulk, setBulk] = useState(false);
  const [names, setNames] = useState('');
  const [firmId, setFirmId] = useState('');
  const save = useSave({ invalidate: ['sales-persons', 'lookup-masters'], onSuccess: () => { setBulk(false); setNames(''); } });
  const cfg: MasterConfig = {
    title: 'Sales Persons', label: 'Sales Person', url: '/api/crm/master/sales-persons', permission: 'acc_sales_persons', queryKey: 'sales-persons',
    columns: [
      { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-gray-900">{r.name}</span> },
      { key: 'firmId', header: 'Firm', render: (r) => firms.data?.find((f) => f.id === r.firmId)?.name ?? 'All Firms' },
      { key: 'userId', header: 'Linked User', render: (r) => users.data?.find((u) => u.id === r.userId)?.name ?? '-' },
      { key: 'remark', header: 'Remark', render: (r) => r.remark || '-' },
      { key: 'isActive', header: 'Status', render: (r) => (r.isActive ? <Badge color="green">Active</Badge> : <Badge>Inactive</Badge>) },
    ],
    defaults: { name: '', firmId: '', userId: '', remark: '', isActive: true },
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'firmId', label: 'Firm', type: 'select', placeholder: 'All Firms', options: () => (firms.data ?? []).map((f) => ({ value: f.id, label: f.name })) },
      { name: 'userId', label: 'Linked User', type: 'combobox', hint: 'Restricts this user to contacts they are sales person of (when enabled)', options: () => (users.data ?? []).map((u) => ({ value: u.id, label: u.name, sub: u.email })) },
      { name: 'isActive', label: 'Active', type: 'switch' },
      { name: 'remark', label: 'Remark', type: 'textarea' },
    ],
    toForm: (r) => ({ ...r, firmId: r.firmId ?? '', userId: r.userId ?? '', remark: r.remark ?? '' }),
    toBody: (v) => ({ ...v, firmId: v.firmId || null, userId: v.userId || null }),
    extraActions: <button className="btn-outline-primary" onClick={() => setBulk(true)}><ListPlus className="h-4 w-4" /> Add Multiple</button>,
  };
  return (
    <>
      <MasterPage cfg={cfg} />
      <Modal open={bulk} onClose={() => setBulk(false)} size="sm" title="Add Multiple Sales Persons" footer={<><button className="btn-outline" onClick={() => setBulk(false)}>Cancel</button><button className="btn-primary" disabled={save.isPending || !names.trim()} onClick={() => save.mutate({ method: 'post', url: '/api/crm/master/sales-persons/bulk', body: { names: names.split('\n').map((s) => s.trim()).filter(Boolean), firmId: firmId || null } })}>{save.isPending && <Spinner />} Save</button></>}>
        <Field label="Names" required hint="One per line"><TextArea value={names} onChange={(e) => setNames(e.target.value)} className="min-h-[140px]" /></Field>
        <Field label="Firm" className="mt-3"><Select value={firmId} onChange={setFirmId} placeholder="All Firms" options={(firms.data ?? []).map((f) => ({ value: f.id, label: f.name }))} /></Field>
      </Modal>
    </>
  );
}

/* ====================== Terms & Conditions ====================== */
export function TermsPage() {
  const firms = useFirms();
  const cfg: MasterConfig = {
    title: 'Terms & Condition', label: 'Terms', url: `${M}/terms-conditions`, permission: 'acc_terms', queryKey: 'terms', modalSize: 'lg',
    columns: [
      { key: 'name', header: 'Name', render: (r) => <span className="flex items-center gap-2 font-medium text-gray-900">{r.name}{r.isDefault && <Badge color="blue">Default</Badge>}</span> },
      { key: 'documentType', header: 'Document Type', render: (r) => titleCase(r.documentType) },
      { key: 'taxType', header: 'Tax Type', render: (r) => (r.taxType === 'both' ? 'Both' : titleCase(r.taxType)) },
      { key: 'firmId', header: 'Firm', render: (r) => firms.data?.find((f) => f.id === r.firmId)?.name ?? 'All Firms' },
      { key: 'content', header: 'Content', render: (r) => <span className="block max-w-[360px] truncate text-gray-500">{r.content}</span> },
    ],
    defaults: { firmId: '', name: '', documentType: 'invoice', taxType: 'both', content: '', isDefault: false, isActive: true },
    fields: [
      { name: 'firmId', label: 'Firm', type: 'select', placeholder: 'All Firms', options: () => (firms.data ?? []).map((f) => ({ value: f.id, label: f.name })) },
      { name: 'name', label: 'Name', required: true, placeholder: 'Standard invoice terms' },
      { name: 'documentType', label: 'Document Type', type: 'select', required: true, options: TERMS_DOCUMENT_TYPES.map((t) => ({ value: t, label: titleCase(t) })) },
      { name: 'taxType', label: 'Tax Type', type: 'select', required: true, options: [{ value: 'both', label: 'Both' }, { value: 'regulated', label: 'Regulated' }, { value: 'unregulated', label: 'Unregulated' }] },
      { name: 'content', label: 'Content', type: 'textarea', required: true, span: 2, hint: 'One clause per line — printed as a numbered list on documents' },
      { name: 'isDefault', label: 'Default for this document type', type: 'switch' },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    toForm: (r) => ({ ...r, firmId: r.firmId ?? '' }),
    toBody: (v) => ({ ...v, firmId: v.firmId || null }),
  };
  return <MasterPage cfg={cfg} />;
}

/* ====================== Cheque books ====================== */
export function ChequeBooksPage() {
  const banks = useLedgers('bank');
  const cfg: MasterConfig = {
    title: 'Cheque Book', label: 'Cheque Book', url: `${M}/cheque-books`, permission: 'acc_cheque_books', queryKey: 'cheque-books',
    columns: [
      { key: 'name', header: 'Name', render: (r) => <span className="flex items-center gap-2 font-medium text-gray-900">{r.name}{r.isDefault && <Badge color="blue">Default</Badge>}</span> },
      { key: 'bankAccountId', header: 'Bank', render: (r) => banks.data?.find((b) => b.id === r.bankAccountId)?.name ?? '-' },
      { key: 'fromNo', header: 'From', align: 'right' },
      { key: 'toNo', header: 'To', align: 'right' },
      { key: 'nextNo', header: 'Next Cheque', align: 'right', render: (r) => <span className="font-mono">{r.nextNo}</span> },
      { key: 'remaining', header: 'Remaining', align: 'right', render: (r) => `${r.remaining} / ${r.total}` },
    ],
    defaults: { bankAccountId: '', name: '', fromNo: '', toNo: '', isDefault: false },
    fields: [
      { name: 'bankAccountId', label: 'Bank', type: 'combobox', required: true, span: 2, options: () => (banks.data ?? []).map((b) => ({ value: b.id, label: b.name })), hint: 'Add bank accounts under Chart of Accounts → Asset → Bank' },
      { name: 'name', label: 'Name', required: true, placeholder: 'HDFC Book 1', span: 2 },
      { name: 'fromNo', label: 'From Cheque No', type: 'number', required: true },
      { name: 'toNo', label: 'To Cheque No', type: 'number', required: true },
      { name: 'isDefault', label: 'Is Default', type: 'switch' },
    ],
    toBody: (v) => ({ ...v, fromNo: Number(v.fromNo), toNo: Number(v.toNo) }),
    emptyDescription: 'Create a bank account in Chart of Accounts first, then add its cheque book here.',
  };
  return <MasterPage cfg={cfg} />;
}

/* ====================== Carriers / Shipment statuses ====================== */
export function CarriersPage() {
  const cfg: MasterConfig = {
    title: 'Carriers', label: 'Carrier', url: `${M}/carriers`, permission: 'acc_carriers', queryKey: 'carriers', modalSize: 'sm',
    columns: [
      { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-gray-900">{r.name}</span> },
      { key: 'trackingUrl', header: 'Tracking URL', render: (r) => <span className="font-mono text-[12px] text-gray-500">{r.trackingUrl || '-'}</span> },
      { key: 'isActive', header: 'Status', render: (r) => (r.isActive ? <Badge color="green">Active</Badge> : <Badge>Inactive</Badge>) },
    ],
    defaults: { name: '', trackingUrl: '', isActive: true },
    fields: [
      { name: 'name', label: 'Name', required: true, span: 2 },
      { name: 'trackingUrl', label: 'Tracking URL', span: 2, placeholder: 'https://carrier.com/track?awb={tracking_number}', hint: 'Use {tracking_number} as placeholder' },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    toForm: (r) => ({ ...r, trackingUrl: r.trackingUrl ?? '' }),
  };
  return <MasterPage cfg={cfg} />;
}
export function ShipmentStatusesPage() {
  const cfg: MasterConfig = {
    title: 'Shipment Statuses', label: 'Status', url: `${M}/shipment-statuses`, permission: 'acc_shipment_statuses', queryKey: 'shipment-statuses', modalSize: 'sm',
    columns: [
      { key: 'name', header: 'Name', render: (r) => <span className="flex items-center gap-2 font-medium text-gray-900">{r.name}{r.isSystem && <Badge>System</Badge>}</span> },
      { key: 'statusType', header: 'Type', render: (r) => <Badge color={r.statusType === 'delivered' ? 'green' : 'blue'}>{titleCase(r.statusType)}</Badge> },
    ],
    defaults: { name: '', statusType: 'shipped' },
    fields: [
      { name: 'name', label: 'Name', required: true, span: 2 },
      { name: 'statusType', label: 'Type', type: 'select', required: true, span: 2, options: [{ value: 'shipped', label: 'Shipped' }, { value: 'delivered', label: 'Delivered (sets delivered date)' }] },
    ],
    canDelete: (r) => !r.isSystem,
  };
  return <MasterPage cfg={cfg} />;
}

/* ====================== Processes ====================== */
export function ProcessesPage() {
  const cfg: MasterConfig = {
    title: 'Process', label: 'Process', url: '/api/accounting/product-process/processes', permission: 'acc_product_process', queryKey: 'processes',
    columns: [
      { key: 'sequence', header: '#', width: 60, align: 'center' },
      { key: 'name', header: 'Process Name', render: (r) => <span className="font-medium text-gray-900">{r.name}</span> },
      { key: 'behavior', header: 'Behavior', render: (r) => <Badge color={r.behavior === 'lab' ? 'purple' : r.behavior === 'pricing' ? 'amber' : 'gray'}>{titleCase(r.behavior)}</Badge> },
      { key: 'returnStatus', header: 'Return Status', render: (r) => titleCase(r.returnStatus) },
      { key: 'autoReturn', header: 'Auto Return', render: (r) => (r.autoReturn ? 'Yes' : 'No') },
      { key: 'description', header: 'Description', render: (r) => r.description || '-', hidden: true },
      { key: 'isActive', header: 'Status', render: (r) => (r.isActive ? <Badge color="green">Active</Badge> : <Badge>Inactive</Badge>) },
    ],
    defaults: { name: '', behavior: 'general', returnStatus: 'available', autoReturn: false, sequence: 1, description: '', isActive: true },
    fields: [
      { name: 'name', label: 'Process Name', required: true, placeholder: 'Polishing' },
      { name: 'sequence', label: 'Sequence', type: 'number', required: true },
      { name: 'behavior', label: 'Behavior', type: 'select', required: true, options: PROCESS_BEHAVIORS.map((b) => ({ value: b, label: titleCase(b) })), hint: 'Lab = certificate flow, Pricing = re-price on return' },
      { name: 'returnStatus', label: 'Stock status after return', type: 'select', options: [{ value: 'available', label: 'Available' }, { value: 'keep_in_process', label: 'Keep in process' }] },
      { name: 'autoReturn', label: 'Auto return on issue', type: 'switch' },
      { name: 'isActive', label: 'Active', type: 'switch' },
      { name: 'description', label: 'Description', type: 'textarea' },
    ],
    toForm: (r) => ({ ...r, description: r.description ?? '' }),
    toBody: (v) => ({ ...v, sequence: Number(v.sequence) || 1 }),
  };
  return <MasterPage cfg={cfg} />;
}

/* ====================== Price lists ====================== */
export function PriceListsPage() {
  const cfg: MasterConfig = {
    title: 'Price Lists', label: 'Price List', url: `${M}/price-lists`, permission: 'acc_price_lists', queryKey: 'price-lists', modalSize: 'sm',
    columns: [
      { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-gray-900">{r.name}</span> },
      { key: 'stockTypes', header: 'Stock Types', render: (r) => <span className="flex flex-wrap gap-1">{(r.stockTypes ?? []).map((s: string) => <Badge key={s} color="blue">{PRODUCT_STOCK_TYPE_LABELS[s as keyof typeof PRODUCT_STOCK_TYPE_LABELS] ?? s}</Badge>)}</span> },
      { key: 'currency', header: 'Currency' },
      { key: 'isActive', header: 'Status', render: (r) => (r.isActive ? <Badge color="green">Active</Badge> : <Badge>Inactive</Badge>) },
    ],
    defaults: { name: '', stockTypes: [], currency: 'INR', isActive: true },
    fields: [
      { name: 'name', label: 'Name', required: true, span: 2 },
      { name: 'stockTypes', label: 'Stock Types', type: 'multi', span: 2, options: PRODUCT_STOCK_TYPES.map((s) => ({ value: s, label: PRODUCT_STOCK_TYPE_LABELS[s] })) },
      { name: 'currency', label: 'Currency', required: true },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    emptyDescription: 'Per-product prices are filled in from the Products module (Phase 2).',
  };
  return <MasterPage cfg={cfg} />;
}

/* ====================== Product name templates ====================== */
const TOKENS = ['##Product Name##', '##Product Code##', '##HSN Code##', '##Description##', '##Stock Id##', '##Barcode##', '##Serial##'];
export function ProductNameTemplatesPage() {
  const q = useQuery({ queryKey: ['name-templates'], queryFn: () => api.get<any[]>(`${M}/product-name-templates`) });
  const [rows, setRows] = useState<any[] | null>(null);
  const data = rows ?? q.data ?? [];
  const save = useSave({ invalidate: ['name-templates'] });
  const upd = (i: number, k: string, v: string) => setRows(data.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const preview = (t: string) => t.replace('##Product Name##', 'Round Brilliant').replace('##Product Code##', 'RB-01').replace('##HSN Code##', '7102').replace('##Description##', 'VS1 F').replace('##Stock Id##', 'STK-1042').replace('##Barcode##', '890123').replace('##Serial##', '7');
  return (
    <>
      <div className="mb-4 flex items-center justify-between"><h2 className="text-[20px] font-semibold text-gray-900">Product Name Templates</h2><button className="btn-primary" disabled={save.isPending || !rows} onClick={() => save.mutate({ method: 'put', url: `${M}/product-name-templates`, body: data.map(({ stockType, productTemplate, subProductTemplate }) => ({ stockType, productTemplate, subProductTemplate })) })}>{save.isPending && <Spinner />} Save</button></div>
      <p className="mb-3 text-[13px] text-gray-500">Available tokens: {TOKENS.map((t) => <code key={t} className="mx-0.5 rounded bg-gray-100 px-1 py-0.5 text-[12px]">{t}</code>)}. Sub-product templates must include a unique token (Serial, Stock Id, Barcode or Product Code).</p>
      <div className="card overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-[#F8FAFC] border-b border-line"><tr><th className="table-head">Stock Type</th><th className="table-head">Product Name Template</th><th className="table-head">Sub-product Name Template</th><th className="table-head">Preview</th></tr></thead>
          <tbody className="divide-y divide-line">
            {data.map((r, i) => (
              <tr key={r.stockType}>
                <td className="table-cell font-medium text-gray-900">{PRODUCT_STOCK_TYPE_LABELS[r.stockType as keyof typeof PRODUCT_STOCK_TYPE_LABELS]}</td>
                <td className="table-cell"><TextInput size="sm" value={r.productTemplate} onChange={(e) => upd(i, 'productTemplate', e.target.value)} className="w-[280px] font-mono" /></td>
                <td className="table-cell"><TextInput size="sm" value={r.subProductTemplate} onChange={(e) => upd(i, 'subProductTemplate', e.target.value)} className="w-[300px] font-mono" /></td>
                <td className="table-cell text-gray-500"><div>{preview(r.productTemplate)}</div><div className="text-[12px]">{preview(r.subProductTemplate)}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ====================== Payment modes / terms (under Banking settings) ====================== */
export function PaymentModesPage() {
  const modes = useMemo<MasterConfig>(() => ({
    title: 'Payment Modes', label: 'Payment Mode', url: `${M}/payment-modes`, permission: 'acc_banking', queryKey: 'payment-modes', modalSize: 'sm',
    columns: [{ key: 'name', header: 'Name', render: (r) => <span className="flex items-center gap-2 font-medium text-gray-900">{r.name}{r.isSystem && <Badge>System</Badge>}</span> }, { key: 'isActive', header: 'Status', render: (r) => (r.isActive ? <Badge color="green">Active</Badge> : <Badge>Inactive</Badge>) }],
    defaults: { name: '', isActive: true }, fields: [{ name: 'name', label: 'Name', required: true, span: 2 }, { name: 'isActive', label: 'Active', type: 'switch' }], canDelete: (r) => !r.isSystem,
  }), []);
  return <MasterPage cfg={modes} />;
}
export function PaymentTermsPage() {
  const cfg = useMemo<MasterConfig>(() => ({
    title: 'Payment Terms', label: 'Payment Term', url: `${M}/payment-terms`, permission: 'admin_general_settings', queryKey: 'payment-terms', modalSize: 'sm',
    columns: [{ key: 'name', header: 'Name', render: (r) => <span className="flex items-center gap-2 font-medium text-gray-900">{r.name}{r.isSystem && <Badge>System</Badge>}</span> }, { key: 'days', header: 'Days', align: 'right' }],
    defaults: { name: '', days: 0 }, fields: [{ name: 'name', label: 'Name', required: true, placeholder: 'Net 90' }, { name: 'days', label: 'Days', type: 'number', required: true }], toBody: (v) => ({ ...v, days: Number(v.days) || 0 }), canDelete: (r) => !r.isSystem,
  }), []);
  return <MasterPage cfg={cfg} />;
}

