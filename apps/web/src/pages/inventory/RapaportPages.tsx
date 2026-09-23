import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Plus, Save, Trash2, Wand2 } from 'lucide-react';
import { Checkbox, Combobox, ConfirmDialog, EmptyState, Field, Modal, RadioGroup, Select, Spinner, TextInput } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { useSave } from '@/lib/queries';
import { useAuthStore } from '@/store/auth';
import { cx, fmtNum } from '@/lib/format';

type Opt = { value: string; label: string };
interface RapOptions { shapes: Opt[]; sizes: Opt[]; colors: Opt[]; clarities: Opt[]; ready: boolean; sizeFieldExists: boolean; shapeFieldExists: boolean; additionalBackFields: { fieldName: string; fieldLabel: string; options: Opt[] }[] }
const useRapOptions = () => useQuery({ queryKey: ['rapaport', 'options'], queryFn: () => api.get<RapOptions>('/api/accounting/rapaport/options'), staleTime: 60_000 });

function NotReady({ o }: { o?: RapOptions }) {
  return <EmptyState title="Set up diamond properties first" description={<>Rapaport prices are keyed by <b>Shape</b> and <b>Size</b> custom fields on Certified Products.{o && !o.shapeFieldExists && ' Shape field is missing.'}{o && !o.sizeFieldExists && ' Size field is missing.'} Go to Settings → Custom Fields → Auto Import Property.</>} />;
}

/** Shape + size pickers shared by the price and additional-back grids. */
function ShapeSize({ o, shape, setShape, size, setSize }: { o: RapOptions; shape: string; setShape: (v: string) => void; size: string; setSize: (v: string) => void }) {
  useEffect(() => { if (!shape && o.shapes[0]) setShape(o.shapes[0].value); }, [o.shapes]); // eslint-disable-line
  useEffect(() => { if (!size && o.sizes[0]) setSize(o.sizes[0].value); }, [o.sizes]); // eslint-disable-line
  return (
    <>
      <Select size="sm" className="w-[160px]" value={shape} onChange={setShape} options={o.shapes} placeholder="Shape" />
      <Select size="sm" className="w-[160px]" value={size} onChange={setSize} options={o.sizes} placeholder="Size" />
    </>
  );
}

/* ======================= Rapaport Price grid ======================= */
export function RapaportPricePage() {
  const opts = useRapOptions();
  const o = opts.data;
  const [shape, setShape] = useState('');
  const [size, setSize] = useState('');
  const [view, setView] = useState<'price' | 'additionalBack'>('price');
  const can = useAuthStore((s) => s.can);
  const canEdit = can('acc_rapaport_prices', 'update');
  const q = useQuery({ queryKey: ['rapaport', 'prices', shape, size], queryFn: () => api.get<{ cells: { color: string; clarity: string; price: number; additionalBack: number }[] }>(`/api/accounting/rapaport/prices${qs({ shape, size })}`), enabled: !!shape && !!size, placeholderData: (x) => x });
  const [edits, setEdits] = useState<Record<string, string>>({});
  useEffect(() => setEdits({}), [shape, size, view]);
  const cell = (c: string, cl: string) => q.data?.cells.find((x) => x.color === c && x.clarity === cl);
  const key = (c: string, cl: string) => `${c}|${cl}`;
  const val = (c: string, cl: string) => edits[key(c, cl)] ?? (cell(c, cl) ? String(cell(c, cl)![view]) : '');
  const save = useSave({ invalidate: ['rapaport'], onSuccess: () => setEdits({}) });
  const [setOpen, setSetOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const del = useSave({ invalidate: ['rapaport'], onSuccess: () => setDelOpen(false) });
  const dirty = Object.keys(edits).length;
  const submit = () => save.mutate({ method: 'put', url: '/api/accounting/rapaport/prices', body: { shape, sizes: [size], cells: Object.entries(edits).map(([k, v]) => { const [color, clarity] = k.split('|'); return { color, clarity, [view]: Number(v || 0) }; }) } });
  const stats = useMemo(() => { const cells = q.data?.cells ?? []; const p = cells.map((c) => c.price).filter((x) => x > 0); return { filled: p.length, min: p.length ? Math.min(...p) : 0, max: p.length ? Math.max(...p) : 0 }; }, [q.data]);
  if (opts.isLoading) return <div className="py-10 text-center"><Spinner className="inline h-5 w-5" /></div>;
  if (!o?.ready) return <><h2 className="mb-3 text-[20px] font-semibold text-gray-900">Rapaport Price</h2><NotReady o={o} /></>;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-[20px] font-semibold text-gray-900">Rapaport Price</h2><p className="text-[13px] text-gray-500">List price ($/ct) per Color × Clarity for each shape and size range. Click a cell to edit; Enter to move down.</p></div>
        {canEdit && <div className="flex gap-2">
          <button className="btn-outline" onClick={() => setSetOpen(true)}><Wand2 className="h-4 w-4" /> Set / Adjust</button>
          <button className="btn-outline" onClick={() => setCopyOpen(true)}><Copy className="h-4 w-4" /> Copy Size</button>
          {can('acc_rapaport_prices', 'delete') && <button className="btn-outline text-red-600" onClick={() => setDelOpen(true)}><Trash2 className="h-4 w-4" /> Delete</button>}
          <button className="btn-primary" disabled={!dirty || save.isPending} onClick={submit}>{save.isPending ? <Spinner /> : <Save className="h-4 w-4" />} Save ({dirty})</button>
        </div>}
      </div>
      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <ShapeSize o={o} shape={shape} setShape={setShape} size={size} setSize={setSize} />
          <div className="flex rounded-lg border border-line p-0.5 text-[13px]">{([['price', 'Price ($/ct)'], ['additionalBack', 'Back %']] as const).map(([v, l]) => <button key={v} onClick={() => setView(v)} className={cx('rounded-md px-3 py-1', view === v ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50')}>{l}</button>)}</div>
          <span className="ml-auto text-[12px] text-gray-500">{stats.filled} / {o.colors.length * o.clarities.length} cells · {stats.filled ? `$${fmtNum(stats.min, 0)} – $${fmtNum(stats.max, 0)}` : 'empty'}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="bg-head"><th className="table-head sticky left-0 bg-head !px-3">Color \ Clarity</th>{o.clarities.map((c) => <th key={c.value} className="table-head !px-2 text-center">{c.label}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {o.colors.map((c, ci) => (
                <tr key={c.value} className="hover:bg-gray-50">
                  <td className="sticky left-0 bg-white px-3 py-1 font-semibold text-gray-800">{c.label}</td>
                  {o.clarities.map((cl, cli) => {
                    const k = key(c.value, cl.value);
                    return (
                      <td key={cl.value} className="px-1 py-0.5 text-center">
                        <input data-r={ci} data-c={cli} type="number" step="any" disabled={!canEdit} value={val(c.value, cl.value)} placeholder="—"
                          className={cx('h-8 w-[74px] rounded border px-1 text-right text-[13px] outline-none focus:border-primary focus:ring-1 focus:ring-primary', edits[k] !== undefined ? 'border-primary bg-primary/5' : 'border-transparent bg-transparent hover:border-line', !val(c.value, cl.value) && 'text-gray-300')}
                          onChange={(e) => setEdits((x) => ({ ...x, [k]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const nr = ci + (e.key === 'ArrowUp' ? -1 : 1); (document.querySelector(`input[data-r="${nr}"][data-c="${cli}"]`) as HTMLInputElement | null)?.focus(); } }} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <SetPricesModal open={setOpen} onClose={() => setSetOpen(false)} o={o} shape={shape} size={size} />
      <CopySizeModal open={copyOpen} onClose={() => setCopyOpen(false)} o={o} shape={shape} size={size} />
      <ConfirmDialog open={delOpen} onClose={() => setDelOpen(false)} loading={del.isPending} title="Delete prices?" message={<>Delete all prices for <b>{o.shapes.find((s) => s.value === shape)?.label}</b> · <b>{o.sizes.find((s) => s.value === size)?.label}</b>?</>} onConfirm={() => del.mutate({ method: 'delete', url: '/api/accounting/rapaport/prices', body: { shape, sizes: [size] } })} />
    </>
  );
}

function SetPricesModal({ open, onClose, o, shape, size }: { open: boolean; onClose: () => void; o: RapOptions; shape: string; size: string }) {
  const [v, setV] = useState({ mode: 'set', value: '', shapes: [shape], sizes: [size], colors: [] as string[], clarities: [] as string[] });
  useEffect(() => { if (open) setV({ mode: 'set', value: '', shapes: [shape], sizes: [size], colors: [], clarities: [] }); }, [open, shape, size]);
  const save = useSave({ invalidate: ['rapaport'], onSuccess: onClose });
  const set = (k: string, val: any) => setV((s) => ({ ...s, [k]: val }));
  return (
    <Modal open={open} onClose={onClose} title="Set / Adjust Prices" footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={save.isPending || v.value === '' || !v.shapes.length || !v.sizes.length} onClick={() => save.mutate({ method: 'post', url: '/api/accounting/rapaport/prices/apply', body: { ...v, value: Number(v.value) } })}>{save.isPending && <Spinner />} Apply</button></>}>
      <div className="grid gap-3">
        <Field label="Action"><RadioGroup value={v.mode} onChange={(x) => set('mode', x)} options={[{ value: 'set', label: 'Set to value' }, { value: 'add', label: 'Add' }, { value: 'subtract', label: 'Subtract' }]} /></Field>
        <Field label="Value ($/ct)" required><TextInput type="number" step="any" min={0} value={v.value} onChange={(e) => set('value', e.target.value)} autoFocus /></Field>
        <Field label="Shapes" required><Combobox multiple value={v.shapes} onChange={(x) => set('shapes', x)} options={o.shapes} /></Field>
        <Field label="Sizes" required><Combobox multiple value={v.sizes} onChange={(x) => set('sizes', x)} options={o.sizes} /></Field>
        <Field label="Colors" hint="Blank = all"><Combobox multiple value={v.colors} onChange={(x) => set('colors', x)} options={o.colors} placeholder="All colors" /></Field>
        <Field label="Clarities" hint="Blank = all"><Combobox multiple value={v.clarities} onChange={(x) => set('clarities', x)} options={o.clarities} placeholder="All clarities" /></Field>
      </div>
    </Modal>
  );
}

function CopySizeModal({ open, onClose, o, shape, size }: { open: boolean; onClose: () => void; o: RapOptions; shape: string; size: string }) {
  const [to, setTo] = useState('');
  useEffect(() => { if (open) setTo(''); }, [open]);
  const save = useSave({ invalidate: ['rapaport'], onSuccess: onClose });
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Copy prices to another size" footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!to || save.isPending} onClick={() => save.mutate({ method: 'post', url: '/api/accounting/rapaport/prices/copy', body: { shape, fromSize: size, toSize: to } })}>{save.isPending && <Spinner />} Copy</button></>}>
      <p className="mb-3 text-[13px] text-gray-600">Copy the whole <b>{o.shapes.find((s) => s.value === shape)?.label}</b> · <b>{o.sizes.find((s) => s.value === size)?.label}</b> grid (prices and back %) to:</p>
      <Select value={to} onChange={setTo} placeholder="Select target size" options={o.sizes.filter((s) => s.value !== size)} />
    </Modal>
  );
}

/* ======================= Additional back by property (cut / polish / fluorescence …) ======================= */
export function RapaportAdditionalBackPage() {
  const opts = useRapOptions();
  const o = opts.data;
  const [shape, setShape] = useState('');
  const [size, setSize] = useState('');
  const can = useAuthStore((s) => s.can);
  const canEdit = can('acc_rapaport_additional_back', 'update');
  const q = useQuery({ queryKey: ['rapaport', 'additional-back', shape, size], queryFn: () => api.get<{ fields: RapOptions['additionalBackFields']; values: { fieldName: string; optionValue: string; backPercent: number }[] }>(`/api/accounting/rapaport/additional-back${qs({ shape, size })}`), enabled: !!shape && !!size, placeholderData: (x) => x });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [applyAll, setApplyAll] = useState(false);
  useEffect(() => setEdits({}), [shape, size]);
  const save = useSave({ invalidate: ['rapaport'], onSuccess: () => setEdits({}) });
  const k = (f: string, v: string) => `${f}|${v}`;
  const val = (f: string, v: string) => edits[k(f, v)] ?? String(q.data?.values.find((x) => x.fieldName === f && x.optionValue === v)?.backPercent ?? '');
  const dirty = Object.keys(edits).length;
  const submit = () => save.mutate({ method: 'put', url: '/api/accounting/rapaport/additional-back', body: { shape, sizes: applyAll ? o!.sizes.map((s) => s.value) : [size], values: Object.entries(edits).map(([kk, v]) => { const [fieldName, optionValue] = kk.split('|'); return { fieldName, optionValue, backPercent: Number(v || 0) }; }) } });
  if (opts.isLoading) return <div className="py-10 text-center"><Spinner className="inline h-5 w-5" /></div>;
  if (!o?.ready) return <><h2 className="mb-3 text-[20px] font-semibold text-gray-900">Rapaport Additional Back</h2><NotReady o={o} /></>;
  const fields = q.data?.fields ?? o.additionalBackFields;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-[20px] font-semibold text-gray-900">Rapaport Additional Back</h2><p className="text-[13px] text-gray-500">Extra discount (+) or premium (−) in % applied on top of the list price for a property value, e.g. Fluorescence = Strong → +8%.</p></div>
        {canEdit && <div className="flex items-center gap-3"><Checkbox checked={applyAll} onChange={setApplyAll} label="Apply to all sizes" /><button className="btn-primary" disabled={!dirty || save.isPending} onClick={submit}>{save.isPending ? <Spinner /> : <Save className="h-4 w-4" />} Save ({dirty})</button></div>}
      </div>
      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3"><ShapeSize o={o} shape={shape} setShape={setShape} size={size} setSize={setSize} /></div>
        {!fields.length ? <EmptyState title="No properties marked for additional back" description="Open Settings → Custom Fields, edit a property (Cut, Polish, Fluorescence…) and turn on “Use in Rapaport additional back”." /> : (
          <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
            {fields.map((f) => (
              <div key={f.fieldName} className="rounded-lg border border-line">
                <div className="border-b border-line bg-head px-3 py-2 text-[12px] font-bold uppercase tracking-wide text-gray-600">{f.fieldLabel}</div>
                <table className="w-full text-[13px]"><tbody className="divide-y divide-line">
                  {f.options.map((op) => (
                    <tr key={op.value}><td className="px-3 py-1.5 text-gray-800">{op.label}</td><td className="w-[120px] px-3 py-1 text-right"><input type="number" step="any" disabled={!canEdit} value={val(f.fieldName, op.value)} placeholder="0" onChange={(e) => setEdits((x) => ({ ...x, [k(f.fieldName, op.value)]: e.target.value }))} className={cx('input input-sm w-[90px] text-right', edits[k(f.fieldName, op.value)] !== undefined && 'border-primary')} /><span className="ml-1 text-gray-500">%</span></td></tr>
                  ))}
                  {!f.options.length && <tr><td className="px-3 py-2 text-gray-500">No options defined</td></tr>}
                </tbody></table>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ======================= Custom size ranges (options of the Size property) ======================= */
export function RapaportCustomSizePage() {
  const cf = useQuery({ queryKey: ['custom-fields', 'certified_products', 'all'], queryFn: () => api.get<{ fields: any[] }>('/api/custom-fields/certified_products'), select: (d) => d.fields });
  const field = cf.data?.find((f) => f.diamondPropertyType === '2');
  const [rows, setRows] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => { if (field) setRows(field.options ?? []); }, [field]);
  const can = useAuthStore((s) => s.can);
  const canEdit = can('acc_rapaport_custom_size', 'update');
  const save = useSave({ invalidate: ['custom-fields', 'rapaport'] });
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const upd = (i: number, k: 'value' | 'label', v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const addRange = () => { if (!from || !to) return; const label = `${Number(from).toFixed(2)}-${Number(to).toFixed(2)}`; if (rows.some((r) => r.label === label)) return; setRows((r) => [...r, { value: label.replace(/\./g, '_'), label }].sort((a, b) => parseFloat(a.label) - parseFloat(b.label))); setFrom(to); setTo(''); };
  const dirty = JSON.stringify(rows) !== JSON.stringify(field?.options ?? []);
  if (cf.isLoading) return <div className="py-10 text-center"><Spinner className="inline h-5 w-5" /></div>;
  if (!field) return <><h2 className="mb-3 text-[20px] font-semibold text-gray-900">Rapaport Custom Size</h2><EmptyState title="Size property not found" description="Import the Size property under Settings → Custom Fields → Auto Import Property, then define your carat ranges here." /></>;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-[20px] font-semibold text-gray-900">Rapaport Custom Size</h2><p className="text-[13px] text-gray-500">Carat ranges used as the Size axis of the Rapaport price grid (e.g. 0.30-0.39). These are the options of the <b>{field.fieldLabel}</b> property.</p></div>
        {canEdit && <button className="btn-primary" disabled={!dirty || save.isPending} onClick={() => save.mutate({ method: 'put', url: `/api/custom-fields/${field.id}`, body: { options: rows } })}>{save.isPending ? <Spinner /> : <Save className="h-4 w-4" />} Save</button>}
      </div>
      <div className="card max-w-[720px]">
        {canEdit && <div className="flex flex-wrap items-end gap-2 border-b border-line px-4 py-3">
          <Field label="From (ct)"><TextInput type="number" step="0.01" className="w-[120px]" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To (ct)"><TextInput type="number" step="0.01" className="w-[120px]" value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addRange()} /></Field>
          <button className="btn-outline-primary mb-[1px]" onClick={addRange} disabled={!from || !to}><Plus className="h-4 w-4" /> Add range</button>
        </div>}
        <table className="w-full text-[13px]">
          <thead><tr className="bg-head"><th className="table-head">#</th><th className="table-head">Range label</th><th className="table-head">Value (key)</th><th className="table-head text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => (
              <tr key={i}><td className="table-cell w-10 text-gray-500">{i + 1}</td><td className="table-cell"><input className="input input-sm w-[160px]" disabled={!canEdit} value={r.label} onChange={(e) => upd(i, 'label', e.target.value)} /></td><td className="table-cell font-mono text-[12px] text-gray-500">{r.value}</td><td className="table-cell text-right">{canEdit && <button className="icon-btn h-7 w-7 text-red-600" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></button>}</td></tr>
            ))}
            {!rows.length && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">No size ranges yet — add your first range above.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
