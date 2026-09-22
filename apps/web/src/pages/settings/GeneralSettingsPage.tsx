import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { RadioGroup, Select, Spinner, Switch, Tabs, TextInput } from '@/components/ui';
import { useSave, useSettings } from '@/lib/queries';
import { useAuthStore } from '@/store/auth';

type S = Record<string, any>;
const Row = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3 last:border-0">
    <div className="min-w-0 max-w-[560px]"><div className="text-[14px] text-gray-800">{label}</div>{hint && <div className="text-[12px] text-gray-500">{hint}</div>}</div>
    <div className="shrink-0">{children}</div>
  </div>
);

export default function GeneralSettingsPage() {
  const q = useSettings();
  const [s, setS] = useState<S>({});
  useEffect(() => { if (q.data) setS(q.data); }, [q.data]);
  const [tab, setTab] = useState('general');
  const can = useAuthStore((st) => st.can);
  const save = useSave({ invalidate: ['firm-settings'] });
  const set = (k: string, v: any) => setS((x) => ({ ...x, [k]: v }));
  const T = (k: string) => <Switch checked={!!s[k]} onChange={(v) => set(k, v)} />;
  const disabled = !can('admin_general_settings', 'update');
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[20px] font-semibold text-gray-900">General Settings</h2>
        <button className="btn-primary" disabled={disabled || save.isPending} onClick={() => save.mutate({ method: 'put', url: '/api/accounting/masters/firm-settings', body: s })}>{save.isPending ? <Spinner /> : <Save className="h-4 w-4" />} Save Changes</button>
      </div>
      <div className="card px-5 pb-2">
        <Tabs value={tab} onChange={setTab} className="pt-3" tabs={[{ value: 'general', label: 'General' }, { value: 'contact', label: 'Contact' }, { value: 'product', label: 'Product & Inventory' }, { value: 'transaction', label: 'Transactions' }, { value: 'print', label: 'Print & Share' }]} />
        {q.isLoading && <div className="py-10 text-center"><Spinner className="inline h-5 w-5" /></div>}
        {tab === 'general' && (
          <div>
            <Row label="Reporting Method" hint="Accrual books revenue when invoiced; Cash when paid."><RadioGroup value={s.reportingMethod ?? 'accrual'} onChange={(v) => set('reportingMethod', v)} options={[{ value: 'accrual', label: 'Accrual' }, { value: 'cash', label: 'Cash' }]} /></Row>
            <Row label="Payment transaction type"><RadioGroup value={s.paymentTransactionType ?? 'bill_to_bill'} onChange={(v) => set('paymentTransactionType', v)} options={[{ value: 'bill_to_bill', label: 'Bill to Bill' }, { value: 'on_account', label: 'On Account' }]} /></Row>
            <Row label="Rounding mode for document totals"><Select size="sm" className="w-[180px]" value={s.roundingMode ?? 'none'} onChange={(v) => set('roundingMode', v)} placeholder="" options={[{ value: 'none', label: 'No rounding' }, { value: 'nearest', label: 'Nearest rupee' }, { value: 'up', label: 'Round up' }, { value: 'down', label: 'Round down' }]} /></Row>
            <Row label="Auto round TDS / TCS amounts">{T('autoRoundTdsTcs')}</Row>
            <Row label="Enable adjustments on documents">{T('enableAdjustments')}</Row>
            <Row label="Enable shipping charges">{T('enableShippingCharges')}</Row>
            <Row label="Enable sales person on documents">{T('enableSalesperson')}</Row>
            <Row label="Discount mode"><Select size="sm" className="w-[180px]" value={s.discountMode ?? 'none'} onChange={(v) => set('discountMode', v)} placeholder="" options={[{ value: 'none', label: 'No discount' }, { value: 'item', label: 'Item level' }, { value: 'transaction', label: 'Transaction level' }, { value: 'both', label: 'Both' }]} /></Row>
            <Row label="Show discount with minus sign">{T('discountMinusSign')}</Row>
            <Row label="Tax inclusivity"><RadioGroup value={s.taxInclusivity ?? 'both'} onChange={(v) => set('taxInclusivity', v)} options={[{ value: 'exclusive', label: 'Exclusive' }, { value: 'inclusive', label: 'Inclusive' }, { value: 'both', label: 'Both' }]} /></Row>
            <Row label="Lab process requires approval">{T('labProcessRequireApproval')}</Row>
          </div>
        )}
        {tab === 'contact' && (
          <div>
            <Row label="Contacts are firm-wise" hint="Each contact belongs to one firm.">{T('contactIsFirmwise')}</Row>
            <Row label="Mobile number compulsory">{T('contactMobileCompulsory')}</Row>
            <Row label="Allow repeated mobile number">{T('allowRepeatedMobile')}</Row>
            <Row label="Hide broker fields">{T('hideBrokerFields')}</Row>
            <Row label="Enable customer credit limit">{T('customerCreditLimit')}</Row>
            <Row label="Contact display format" hint="Placeholders: ##Serial No## ##Company Name## ##Person Name## ##Mobile No## ##Email## ##GST No##"><TextInput size="sm" className="w-[360px] font-mono" value={s.contactDisplayFormat ?? ''} onChange={(e) => set('contactDisplayFormat', e.target.value)} /></Row>
          </div>
        )}
        {tab === 'product' && (
          <div>
            <Row label="Stock valuation method"><Select size="sm" className="w-[180px]" value={s.stockValuationMethod ?? 'fifo'} onChange={(v) => set('stockValuationMethod', v)} placeholder="" options={[{ value: 'fifo', label: 'FIFO' }, { value: 'weighted_average', label: 'Weighted Average' }]} /></Row>
            <Row label="Quantity decimal places"><TextInput size="sm" type="number" min={0} max={6} className="w-[90px]" value={s.itemQuantityDecimalRate ?? 2} onChange={(e) => set('itemQuantityDecimalRate', Number(e.target.value))} /></Row>
            <Row label="Serialized inventory tracking" hint="Shows Certified Products & serial-wise stock.">{T('serializedInventoryTracking')}</Row>
            <Row label="Batch / lot tracking">{T('batchLotTracking')}</Row>
            <Row label="Show SKU series">{T('showSkuSeries')}</Row>
            <Row label="Show MRP">{T('showMrp')}</Row>
            <Row label="Display product image in lists">{T('displayImage')}</Row>
            <Row label="Display Pcs column on documents">{T('displayPcsColumn')}</Row>
            <Row label="Stock transfer type"><RadioGroup value={s.stockTransferType ?? 'direct'} onChange={(v) => set('stockTransferType', v)} options={[{ value: 'direct', label: 'Direct' }, { value: 'in_transit', label: 'Via In-Transit' }]} /></Row>
            <Row label="Stock transfer rate"><RadioGroup value={s.stockTransferRate ?? 'manually'} onChange={(v) => set('stockTransferRate', v)} options={[{ value: 'manually', label: 'Enter manually' }, { value: 'cost', label: 'Cost price' }, { value: 'sales', label: 'Sales price' }]} /></Row>
            <Row label="Track inventory for purchase memos">{T('trackInventoryForPo')}</Row>
            <Row label="Allow negative stock — Sales Memo">{T('allowedNegativeStockSo')}</Row>
            <Row label="Allow negative stock — Invoice">{T('allowedNegativeStockInvoice')}</Row>
            <Row label="Allow negative stock — Debit Note">{T('allowedNegativeStockDebitNote')}</Row>
            <Row label="Allow negative stock — Transfer">{T('allowedNegativeStockTransfer')}</Row>
            <Row label="Show negative stock alert">{T('showNegativeStockAlert')}</Row>
            <Row label="Low stock reminder">{T('lowStockReminder')}</Row>
            <Row label="Customer-wise product rate">{T('allowCustomerWiseProductRate')}</Row>
            <Row label="Date-wise price list">{T('useDateWisePrice')}</Row>
          </div>
        )}
        {tab === 'transaction' && (
          <div>
            <Row label="Customer is required on sales documents">{T('requireCustomer')}</Row>
            <Row label="Show “Save as Draft” button">{T('showSaveAsDraftButton')}</Row>
            <Row label="Show product past data while billing">{T('showProductPastData')}</Row>
            <Row label="Auto-fill rate from past data">{T('autoFillRateFromPastData')}</Row>
            <Row label="Purchase memo bill no. mandatory">{T('purchaseMemoBillNoMandatory')}</Row>
            <Row label="Terms & conditions bill-wise">
              <div className="flex flex-wrap gap-4">
                {['invoice', 'estimate', 'proforma', 'purchase_order'].map((k) => (
                  <Switch key={k} checked={!!s.termsBillwise?.[k]} onChange={(v) => set('termsBillwise', { ...(s.termsBillwise ?? {}), [k]: v })} label={k.replace('_', ' ')} className="capitalize" />
                ))}
              </div>
            </Row>
          </div>
        )}
        {tab === 'print' && (
          <div>
            <Row label="Default print copies"><TextInput size="sm" type="number" min={1} max={5} className="w-[90px]" value={s.printCopies ?? 1} onChange={(e) => set('printCopies', Number(e.target.value))} /></Row>
            <Row label="Ask for template while sharing">{T('selectTemplateWhileSharing')}</Row>
          </div>
        )}
      </div>
      <p className="mt-3 text-[12px] text-gray-500">Changes apply to all firms in this organization.</p>
    </>
  );
}
