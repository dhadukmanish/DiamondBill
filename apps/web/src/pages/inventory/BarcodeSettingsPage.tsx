import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { PRODUCT_STOCK_TYPE_LABELS } from '@diamondbill/shared';
import { Checkbox, Field, Select, Spinner, Tabs, TextInput } from '@/components/ui';
import { api } from '@/lib/api';
import { useSave } from '@/lib/queries';
import { useAuthStore } from '@/store/auth';

const DEFAULTS = { barcodeType: 'code128', labelWidth: 50, labelHeight: 25, columns: 2, copies: 1, fontSize: 8, showName: true, showSku: true, showPrice: true, showWeight: false, showFirm: false, showProperties: false, priceMode: 'selling', prefixText: '', suffixText: '' };
type Cfg = typeof DEFAULTS;
const TYPES = Object.entries(PRODUCT_STOCK_TYPE_LABELS);

/** Settings → Product Barcode: label layout per stock type (used by the print-label action on products). */
export default function BarcodeSettingsPage() {
  const q = useQuery({ queryKey: ['barcode-settings'], queryFn: () => api.get<(Partial<Cfg> & { stockType: string })[]>('/api/accounting/masters/barcode-settings') });
  const [type, setType] = useState('general');
  const [c, setC] = useState<Cfg>(DEFAULTS);
  useEffect(() => { setC({ ...DEFAULTS, ...(q.data?.find((r) => r.stockType === type) ?? {}) }); }, [q.data, type]);
  const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setC((x) => ({ ...x, [k]: v }));
  const can = useAuthStore((s) => s.can);
  const save = useSave({ invalidate: ['barcode-settings'] });
  const disabled = !can('acc_product_barcode_settings', 'update');
  const N = (k: keyof Cfg) => <TextInput type="number" min={1} value={String(c[k])} onChange={(e) => set(k, Number(e.target.value) as any)} />;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-[20px] font-semibold text-gray-900">Product Barcode Settings</h2><p className="text-[13px] text-gray-500">Label size and contents for each stock type. Certified stones can also print their diamond properties.</p></div>
        <button className="btn-primary" disabled={disabled || save.isPending} onClick={() => save.mutate({ method: 'put', url: '/api/accounting/masters/barcode-settings', body: { stockType: type, ...c } })}>{save.isPending ? <Spinner /> : <Save className="h-4 w-4" />} Save</button>
      </div>
      <Tabs value={type} onChange={setType} tabs={TYPES.map(([value, label]) => ({ value, label }))} className="mb-4" />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="card p-5">
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-3">
            <Field label="Barcode Type"><Select value={c.barcodeType} onChange={(v) => set('barcodeType', v)} options={[{ value: 'code128', label: 'Code 128' }, { value: 'code39', label: 'Code 39' }, { value: 'ean13', label: 'EAN-13' }, { value: 'qr', label: 'QR Code' }]} /></Field>
            <Field label="Label Width (mm)">{N('labelWidth')}</Field>
            <Field label="Label Height (mm)">{N('labelHeight')}</Field>
            <Field label="Labels per Row">{N('columns')}</Field>
            <Field label="Copies per Item">{N('copies')}</Field>
            <Field label="Font Size (pt)">{N('fontSize')}</Field>
            <Field label="Price to Print"><Select value={c.priceMode} onChange={(v) => set('priceMode', v)} options={[{ value: 'selling', label: 'Selling price' }, { value: 'mrp', label: 'MRP / list price' }, { value: 'none', label: 'No price' }]} /></Field>
            <Field label="Prefix Text" hint="Printed before the SKU"><TextInput value={c.prefixText} onChange={(e) => set('prefixText', e.target.value)} /></Field>
            <Field label="Suffix Text"><TextInput value={c.suffixText} onChange={(e) => set('suffixText', e.target.value)} /></Field>
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <div className="label">Show on label</div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Checkbox checked={c.showName} onChange={(v) => set('showName', v)} label="Product name" />
              <Checkbox checked={c.showSku} onChange={(v) => set('showSku', v)} label="SKU" />
              <Checkbox checked={c.showPrice} onChange={(v) => set('showPrice', v)} label="Price" />
              <Checkbox checked={c.showWeight} onChange={(v) => set('showWeight', v)} label="Weight" />
              <Checkbox checked={c.showFirm} onChange={(v) => set('showFirm', v)} label="Firm name" />
              {type === 'certified' && <Checkbox checked={c.showProperties} onChange={(v) => set('showProperties', v)} label="Diamond properties (shape / color / clarity)" />}
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="label">Preview</div>
          <div className="mx-auto flex flex-col items-center justify-center overflow-hidden rounded border border-dashed border-gray-400 bg-white p-2 text-center" style={{ width: c.labelWidth * 4, height: c.labelHeight * 4, fontSize: c.fontSize * 1.3 }}>
            {c.showFirm && <div className="truncate font-semibold">Your Firm</div>}
            {c.showName && <div className="truncate">{type === 'certified' ? 'Round 1.02ct G VS1' : 'Sample Product'}</div>}
            <div className="my-0.5 h-6 w-4/5 bg-[repeating-linear-gradient(90deg,#000_0_2px,#fff_2px_4px)]" />
            {c.showSku && <div className="font-mono">{c.prefixText}SKU-0001{c.suffixText}</div>}
            <div className="flex gap-2">{c.showWeight && <span>1.02 ct</span>}{c.showPrice && c.priceMode !== 'none' && <span>₹ 1,20,000</span>}</div>
            {type === 'certified' && c.showProperties && <div className="text-gray-600">RD · G · VS1 · EX</div>}
          </div>
          <p className="mt-2 text-center text-[11px] text-gray-500">{c.labelWidth} × {c.labelHeight} mm · {c.columns}/row · {c.copies} copy</p>
        </div>
      </div>
    </>
  );
}
