import { useEffect, useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { GripVertical, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { CUSTOM_FIELD_MODULES, CUSTOM_FIELD_TYPE_GROUPS, DIAMOND_PROPERTY_TYPES, type CustomFieldType } from '@diamondbill/shared';
import { DataTable, useListState, type Column } from '@/components/data/DataTable';
import { Badge, Checkbox, Combobox, ConfirmDialog, Field, Modal, Select, Spinner, Switch, TextArea, TextInput } from '@/components/ui';
import { api } from '@/lib/api';
import { applyApiErrors, useSave } from '@/lib/queries';
import { useAuthStore } from '@/store/auth';
import { fmtDate } from '@/lib/format';

const typeLabel = (t: string) => CUSTOM_FIELD_TYPE_GROUPS.flatMap((g) => g.types).find((x) => x.type === t)?.label ?? t;
const moduleLabel = (m: string) => CUSTOM_FIELD_MODULES.find((x) => x.name === m)?.label ?? m;
const OPTION_TYPES: CustomFieldType[] = ['select', 'multi_select', 'radio', 'checkbox_group', 'lookup'] as any;
const hasOptions = (t: string) => OPTION_TYPES.includes(t as any);
const slug = (s: string) => s.trim().toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

function TypePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (t: CustomFieldType) => void }) {
  const [q, setQ] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Select Field Type" size="lg">
      <TextInput placeholder="Search field types..." value={q} onChange={(e) => setQ(e.target.value)} className="mb-4" />
      <div className="space-y-5">
        {CUSTOM_FIELD_TYPE_GROUPS.map((g) => {
          const types = g.types.filter((t) => !q || t.label.toLowerCase().includes(q.toLowerCase()));
          if (!types.length) return null;
          return (
            <div key={g.group}>
              <div className="section-title mb-2">{g.group}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {types.map((t) => (
                  <button key={t.type} type="button" onClick={() => onPick(t.type)} className="rounded-lg border border-line px-3 py-2.5 text-left hover:border-primary hover:bg-primary/5 transition">
                    <div className="text-[14px] font-medium text-gray-900">{t.label}</div>
                    <div className="text-[12px] text-gray-500">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

const defaults = { fieldLabel: '', fieldName: '', fieldType: 'text' as string, moduleNames: [] as string[], options: [] as { value: string; label: string }[], isRequired: false, isReadOnly: false, tooltip: '', showTooltip: false, defaultValue: '', diamondPropertyType: '', usedInLabProcess: false, useInRapaportAdditionalBack: false, displaySection: '', conditionalFields: {} as Record<string, string[]> };

function Editor({ open, onClose, row, type, moduleName }: { open: boolean; onClose: () => void; row?: any | null; type?: CustomFieldType; moduleName?: string }) {
  const { register, handleSubmit, control, reset, watch, setValue, setError, formState: { errors } } = useForm<typeof defaults>({ defaultValues: defaults });
  const opts = useFieldArray({ control, name: 'options' });
  useEffect(() => { if (open) reset(row ? { ...defaults, ...row, tooltip: row.tooltip ?? '', defaultValue: row.defaultValue ?? '', diamondPropertyType: row.diamondPropertyType ?? '', displaySection: row.displaySection ?? '', options: row.options ?? [] } : { ...defaults, fieldType: type ?? 'text', moduleNames: moduleName ? [moduleName] : [] }); }, [open, row, type, moduleName, reset]);
  const [label, name, ftype, modules, propType, options] = [watch('fieldLabel'), watch('fieldName'), watch('fieldType'), watch('moduleNames'), watch('diamondPropertyType'), watch('options')];
  const [nameTouched, setNameTouched] = useState(false);
  useEffect(() => { if (!row && !nameTouched) setValue('fieldName', slug(label)); }, [label]); // eslint-disable-line
  useEffect(() => {
    // when a diamond property is chosen and no options yet, prefill its standard options
    const p = DIAMOND_PROPERTY_TYPES.find((x) => x.code === propType);
    if (p && !row && p.options?.length && options.length === 0) setValue('options', p.options.map((o) => ({ value: slug(o), label: o })));
  }, [propType]); // eslint-disable-line
  const save = useSave({ invalidate: ['custom-fields'], onSuccess: onClose });
  const submit = handleSubmit((v) => save.mutate({ method: row ? 'put' : 'post', url: row ? `/api/custom-fields/${row.id}` : '/api/custom-fields', body: { ...v, diamondPropertyType: v.diamondPropertyType || null, tooltip: v.tooltip || null, defaultValue: v.defaultValue || null, displaySection: v.displaySection || null } }, { onError: (e) => applyApiErrors(e, setError as any) }));
  const isCertified = modules.includes('certified_products');
  const [bulkOpts, setBulkOpts] = useState('');
  return (
    <Modal open={open} onClose={onClose} title={row ? `Edit Field — ${row.fieldLabel}` : `Add ${typeLabel(ftype)} Field`} size="lg" footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending && <Spinner />} {row ? 'Update' : 'Save'}</button></>}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Field Label" required error={errors.fieldLabel?.message}><TextInput {...register('fieldLabel', { required: 'Required' })} placeholder="e.g. Shape" /></Field>
        <Field label="Field Name (key)" hint="Used in API / import files" error={errors.fieldName?.message}><TextInput {...register('fieldName')} onFocus={() => setNameTouched(true)} placeholder={slug(label) || 'auto'} className="font-mono" /></Field>
        <Field label="Field Type"><Controller control={control} name="fieldType" render={({ field }) => <Select value={field.value} onChange={field.onChange} disabled={!!row} options={CUSTOM_FIELD_TYPE_GROUPS.flatMap((g) => g.types.map((t) => ({ value: t.type, label: `${t.label} (${g.group})` })))} />} /></Field>
        <Field label="Modules" required error={(errors.moduleNames as any)?.message}><Controller control={control} name="moduleNames" rules={{ validate: (v) => v.length > 0 || 'Select at least one module' }} render={({ field }) => <Combobox multiple value={field.value} onChange={field.onChange} options={CUSTOM_FIELD_MODULES.map((m) => ({ value: m.name, label: m.label }))} />} /></Field>
        {isCertified && (
          <>
            <Field label="Diamond Property Type" hint="Maps this field to a standard diamond property (Shape, Color, Clarity …) used by Rapaport & lab processes"><Controller control={control} name="diamondPropertyType" render={({ field }) => <Combobox value={field.value} onChange={field.onChange} options={DIAMOND_PROPERTY_TYPES.map((p) => ({ value: p.code, label: p.label, sub: `#${p.code}` }))} placeholder="None" />} /></Field>
            <Field label="Display Section"><Controller control={control} name="displaySection" render={({ field }) => <Select value={field.value} onChange={field.onChange} placeholder="Default" options={['Basic', 'Grading', 'Measurements', 'Pricing', 'Other'].map((s) => ({ value: s.toLowerCase(), label: s }))} />} /></Field>
            <div className="sm:col-span-2 flex flex-wrap gap-6">
              <Controller control={control} name="usedInLabProcess" render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label="Used in Lab Process" />} />
              <Controller control={control} name="useInRapaportAdditionalBack" render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label="Use in Rapaport Additional Back" />} />
            </div>
          </>
        )}
        {hasOptions(ftype) && (
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between mb-2"><label className="label mb-0">Options</label><button type="button" className="link text-[13px]" onClick={() => opts.append({ value: '', label: '' })}>+ Add option</button></div>
            <div className="space-y-2">
              {opts.fields.map((f, i) => (
                <div key={f.id} className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-gray-300" />
                  <TextInput size="sm" placeholder="Label" {...register(`options.${i}.label`)} onBlur={(e) => { if (!watch(`options.${i}.value`)) setValue(`options.${i}.value`, slug(e.target.value)); }} />
                  <TextInput size="sm" placeholder="Value" {...register(`options.${i}.value`)} className="font-mono w-[180px]" />
                  <button type="button" className="icon-btn h-7 w-7 text-red-600" onClick={() => opts.remove(i)}><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              {opts.fields.length === 0 && <p className="text-[12px] text-gray-500">No options yet.</p>}
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-[12px] text-gray-500">Paste options (one per line)</summary>
              <div className="mt-2 flex gap-2"><TextArea value={bulkOpts} onChange={(e) => setBulkOpts(e.target.value)} placeholder={'Round\nPear\nOval'} /><button type="button" className="btn-outline self-start" onClick={() => { bulkOpts.split('\n').map((s) => s.trim()).filter(Boolean).forEach((l) => opts.append({ value: slug(l), label: l })); setBulkOpts(''); }}>Add</button></div>
            </details>
          </div>
        )}
        <Field label="Default Value"><TextInput {...register('defaultValue')} /></Field>
        <Field label="Tooltip"><TextInput {...register('tooltip')} placeholder="Help text shown next to the field" /></Field>
        <div className="sm:col-span-2 flex flex-wrap gap-6 pt-1">
          <Controller control={control} name="isRequired" render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label="Required" />} />
          <Controller control={control} name="isReadOnly" render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label="Read only" />} />
          <Controller control={control} name="showTooltip" render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label="Show tooltip" />} />
        </div>
        {name && <p className="sm:col-span-2 text-[12px] text-gray-500">This field will be stored as <span className="font-mono text-gray-700">customFields.{name}</span></p>}
      </form>
    </Modal>
  );
}

function AutoImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sel, setSel] = useState<Record<string, boolean>>(() => Object.fromEntries(DIAMOND_PROPERTY_TYPES.slice(0, 12).map((p) => [p.key, true])));
  const save = useSave({ invalidate: ['custom-fields'], onSuccess: onClose });
  const all = DIAMOND_PROPERTY_TYPES.every((p) => sel[p.key]);
  return (
    <Modal open={open} onClose={onClose} title="Auto Import Diamond Properties" size="lg" footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate({ method: 'post', url: '/api/custom-fields/auto-import', body: { keys: Object.keys(sel).filter((k) => sel[k]) } })}>{save.isPending && <Spinner />} Import {Object.values(sel).filter(Boolean).length} Properties</button></>}>
      <p className="mb-3 text-[13px] text-gray-500">Creates the standard certified-diamond properties (Shape, Carat, Color, Clarity, Cut, Polish, Symmetry, Fluorescence, Measurements, Lab, Certificate No …) as custom fields on <b>Certified Products</b>, with their standard options pre-filled. Existing fields are skipped.</p>
      <Checkbox checked={all} onChange={(v) => setSel(Object.fromEntries(DIAMOND_PROPERTY_TYPES.map((p) => [p.key, v])))} label="Select all" className="mb-2" />
      <div className="grid gap-1.5 sm:grid-cols-2 max-h-[380px] overflow-y-auto rounded-lg border border-line p-3">
        {DIAMOND_PROPERTY_TYPES.map((p) => (
          <Checkbox key={p.key} checked={!!sel[p.key]} onChange={(v) => setSel((s) => ({ ...s, [p.key]: v }))} label={<span>{p.label} <span className="text-gray-400 text-[12px]">· {typeLabel(p.fieldType)}{p.required ? ' · required' : ''}</span></span>} />
        ))}
      </div>
    </Modal>
  );
}

export default function CustomFieldsPage() {
  const [state, setState] = useListState({ limit: 100 });
  const [moduleName, setModuleName] = useState('');
  const q = useQuery({ queryKey: ['custom-fields', 'all'], queryFn: () => api.get<{ groups: any[] }>('/api/custom-fields/groups') });
  const rows = useMemo(() => (q.data?.groups ?? []).filter((r) => (!moduleName || r.moduleNames?.includes(moduleName)) && (!state.search || (r.fieldLabel + ' ' + r.fieldName).toLowerCase().includes(state.search.toLowerCase()))), [q.data, moduleName, state.search]);
  const [picker, setPicker] = useState(false);
  const [editor, setEditor] = useState<{ row?: any; type?: CustomFieldType } | null>(null);
  const [auto, setAuto] = useState(false);
  const [del, setDel] = useState<any | null>(null);
  const can = useAuthStore((s) => s.can);
  const remove = useSave({ invalidate: ['custom-fields'], onSuccess: () => setDel(null) });
  const toggleActive = useSave({ invalidate: ['custom-fields'] });
  const columns: Column<any>[] = [
    { key: 'displayOrder', header: '#', width: 50, align: 'center', render: (r) => r.displayOrder },
    { key: 'fieldLabel', header: 'Field Label', render: (r) => (<div><div className="font-medium text-gray-900">{r.fieldLabel}{r.isRequired && <span className="text-red-500"> *</span>}</div><div className="font-mono text-[11px] text-gray-400">{r.fieldName}</div></div>) },
    { key: 'fieldType', header: 'Type', render: (r) => <Badge>{typeLabel(r.fieldType)}</Badge> },
    { key: 'moduleNames', header: 'Modules', render: (r) => <span className="flex flex-wrap gap-1">{(r.moduleNames ?? []).map((m: string) => <Badge key={m} color="blue">{moduleLabel(m)}</Badge>)}</span> },
    { key: 'diamondPropertyType', header: 'Diamond Property', render: (r) => (r.diamondPropertyType ? DIAMOND_PROPERTY_TYPES.find((p) => p.code === r.diamondPropertyType)?.label ?? r.diamondPropertyType : '-') },
    { key: 'options', header: 'Options', render: (r) => (hasOptions(r.fieldType) ? `${r.options?.length ?? 0} option(s)` : '-'), hidden: true },
    { key: 'isActive', header: 'Active', align: 'center', render: (r) => <Switch checked={r.isActive} onChange={(v) => toggleActive.mutate({ method: 'put', url: `/api/custom-fields/${r.id}`, body: { isActive: v } as any })} /> },
    { key: 'createdAt', header: 'Created At', render: (r) => fmtDate(r.createdAt, true), hidden: true },
  ];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[20px] font-semibold text-gray-900">Custom Field</h2>
      </div>
      <DataTable storageKey="custom-fields" clientSide columns={columns} rows={rows} loading={q.isFetching} state={state} onStateChange={setState} rowKey={(r) => r.id} onRefresh={() => q.refetch()} hidePagination
        toolbar={<Select size="sm" className="w-[220px]" value={moduleName} onChange={setModuleName} placeholder="All Modules" options={CUSTOM_FIELD_MODULES.map((m) => ({ value: m.name, label: m.label }))} />}
        actions={can('crm_custom_fields', 'create') && (<><button className="btn-outline-primary" onClick={() => setAuto(true)}><Sparkles className="h-4 w-4" /> Auto Import Property</button><button className="btn-primary" onClick={() => setPicker(true)}><Plus className="h-4 w-4" /> Add Field</button></>)}
        rowActions={(r) => (<span className="inline-flex gap-1"><button className="icon-btn h-7 w-7" onClick={() => setEditor({ row: r })}><Pencil className="h-3.5 w-3.5" /></button><button className="icon-btn h-7 w-7 text-red-600" onClick={() => setDel(r)}><Trash2 className="h-3.5 w-3.5" /></button></span>)}
        emptyTitle="No custom fields" emptyDescription={<span>Add fields to any module, or use <b>Auto Import Property</b> to create the standard diamond properties in one click.</span>} />
      <TypePicker open={picker} onClose={() => setPicker(false)} onPick={(t) => { setPicker(false); setEditor({ type: t }); }} />
      <Editor open={!!editor} onClose={() => setEditor(null)} row={editor?.row} type={editor?.type} moduleName={moduleName} />
      <AutoImport open={auto} onClose={() => setAuto(false)} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} loading={remove.isPending} title="Delete field?" message={<>Delete <b>{del?.fieldLabel}</b>? Values already saved on records will no longer be shown.</>} onConfirm={() => del && remove.mutate({ method: 'delete', url: `/api/custom-fields/${del.id}` })} />
    </>
  );
}

