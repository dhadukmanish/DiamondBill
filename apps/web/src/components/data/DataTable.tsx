import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Download, Filter, MoreVertical, RefreshCw, Search, Upload, X } from 'lucide-react';
import { Checkbox, Dropdown, EmptyState, Modal, Select, Spinner } from '@/components/ui';
import { cx } from '@/lib/format';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T, index: number) => ReactNode;
  sortable?: boolean;
  width?: string | number;
  align?: 'left' | 'right' | 'center';
  hidden?: boolean; // hidden by default (user can enable in Customize Columns)
  className?: string;
}

export interface ListState {
  page: number;
  limit: number;
  search: string;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

export function useListState(init?: Partial<ListState>) {
  const [state, setState] = useState<ListState>({ page: 1, limit: 20, search: '', sortOrder: 'desc', ...init });
  const set = (p: Partial<ListState>) => setState((s) => ({ ...s, ...p, page: p.page ?? (p.search !== undefined || p.limit !== undefined || p.sortBy !== undefined ? 1 : s.page) }));
  return [state, set] as const;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  total?: number;
  loading?: boolean;
  state?: ListState;
  onStateChange?: (p: Partial<ListState>) => void;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  selected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  toolbar?: ReactNode; // left of search
  actions?: ReactNode; // right side buttons (e.g. Add)
  filters?: ReactNode; // rendered in collapsible filter panel
  activeFilterCount?: number;
  storageKey?: string; // persist visible columns
  onRefresh?: () => void;
  onImport?: () => void;
  onExport?: () => void;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  rowActions?: (row: T) => ReactNode;
  footer?: ReactNode;
  dense?: boolean;
  hideSearch?: boolean;
  hidePagination?: boolean;
  searchPlaceholder?: string;
}

export function DataTable<T>({ columns, rows, total, loading, state, onStateChange, rowKey, onRowClick, selectable, selected = [], onSelectedChange, toolbar, actions, filters, activeFilterCount = 0, storageKey, onRefresh, onImport, onExport, emptyTitle, emptyDescription, rowActions, footer, dense, hideSearch, hidePagination, searchPlaceholder }: Props<T>) {
  const [showFilters, setShowFilters] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [sortDlg, setSortDlg] = useState(false);
  const [search, setSearch] = useState(state?.search ?? '');
  useEffect(() => setSearch(state?.search ?? ''), [state?.search]);
  useEffect(() => {
    if (!onStateChange || state === undefined) return;
    const t = setTimeout(() => search !== state.search && onStateChange({ search }), 350);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const [visible, setVisible] = useState<string[]>(() => {
    try {
      const saved = storageKey && localStorage.getItem(`cols:${storageKey}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return columns.filter((c) => !c.hidden).map((c) => c.key);
  });
  useEffect(() => {
    if (storageKey) try { localStorage.setItem(`cols:${storageKey}`, JSON.stringify(visible)); } catch {}
  }, [visible, storageKey]);
  const cols = useMemo(() => columns.filter((c) => visible.includes(c.key)), [columns, visible]);

  const allIds = rows.map(rowKey);
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.includes(id));
  const toggleAll = () => onSelectedChange?.(allChecked ? selected.filter((id) => !allIds.includes(id)) : Array.from(new Set([...selected, ...allIds])));

  const count = total ?? rows.length;
  const page = state?.page ?? 1;
  const limit = state?.limit ?? (rows.length || 1);
  const from = count === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(count, page * limit);
  const pages = Math.max(1, Math.ceil(count / limit));

  const sortIcon = (c: Column<T>) => {
    if (!c.sortable) return null;
    if (state?.sortBy !== c.key) return <ArrowUpDown className="h-3 w-3 text-gray-400" />;
    return state.sortOrder === 'asc' ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />;
  };
  const onSort = (c: Column<T>) => c.sortable && onStateChange?.({ sortBy: c.key, sortOrder: state?.sortBy === c.key && state.sortOrder === 'asc' ? 'desc' : 'asc' });

  const kebab = [
    ...(columns.some((c) => c.sortable) ? [{ label: 'Sort', icon: <ArrowUpDown className="h-4 w-4" />, onClick: () => setSortDlg(true) }] : []),
    ...(onImport ? [{ label: 'Import', icon: <Upload className="h-4 w-4" />, onClick: onImport }] : []),
    ...(onExport ? [{ label: 'Export', icon: <Download className="h-4 w-4" />, onClick: onExport }] : []),
    { label: 'Customize Columns', icon: <Columns3 className="h-4 w-4" />, onClick: () => setCustomize(true) },
    ...(onRefresh ? [{ label: 'Refresh', icon: <RefreshCw className="h-4 w-4" />, onClick: onRefresh }] : []),
  ];

  return (
    <div className="card overflow-hidden">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line">
        {toolbar}
        {!hideSearch && (
          <div className="relative w-full sm:w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={searchPlaceholder ?? 'Search...'} className="input input-sm pl-9 pr-8" />
            {search && <X className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 cursor-pointer" onClick={() => setSearch('')} />}
          </div>
        )}
        {filters && (
          <button type="button" onClick={() => setShowFilters((s) => !s)} className={cx('btn-outline', (showFilters || activeFilterCount > 0) && 'border-primary text-primary')}>
            <Filter className="h-4 w-4" /> Filters{activeFilterCount > 0 && <span className="badge bg-primary text-white ml-1">{activeFilterCount}</span>}
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {selected.length > 0 && <span className="text-[13px] text-gray-500">{selected.length} selected</span>}
          {actions}
          <Dropdown items={kebab} trigger={<button type="button" className="icon-btn"><MoreVertical className="h-4 w-4" /></button>} />
        </div>
      </div>
      {showFilters && filters && <div className="grid gap-3 px-4 py-3 border-b border-line bg-gray-50/60 sm:grid-cols-2 lg:grid-cols-4">{filters}</div>}

      {/* table */}
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-[#F8FAFC] border-b border-line">
            <tr>
              {selectable && (
                <th className="table-head w-10 !px-4">
                  <Checkbox checked={allChecked} onChange={toggleAll} />
                </th>
              )}
              {cols.map((c) => (
                <th key={c.key} style={{ width: c.width }} className={cx('table-head', c.sortable && 'cursor-pointer select-none hover:text-gray-800', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')} onClick={() => onSort(c)}>
                  <span className="inline-flex items-center gap-1">{c.header}{sortIcon(c)}</span>
                </th>
              ))}
              {rowActions && <th className="table-head w-16 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading && rows.length === 0 && (
              <tr><td colSpan={cols.length + 2} className="py-12 text-center text-gray-500"><Spinner className="inline h-5 w-5" /></td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={cols.length + 2}><EmptyState title={emptyTitle} description={emptyDescription} /></td></tr>
            )}
            {rows.map((r, i) => {
              const id = rowKey(r);
              const isSel = selected.includes(id);
              return (
                <tr key={id} onClick={() => onRowClick?.(r)} className={cx('transition-colors', onRowClick && 'cursor-pointer', isSel ? 'bg-primary-lighter/30' : 'hover:bg-gray-50/70', loading && 'opacity-60')}>
                  {selectable && (
                    <td className="table-cell !px-4" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={isSel} onChange={(v) => onSelectedChange?.(v ? [...selected, id] : selected.filter((x) => x !== id))} />
                    </td>
                  )}
                  {cols.map((c) => (
                    <td key={c.key} className={cx('table-cell', dense && '!py-2', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.className)}>
                      {c.render ? c.render(r, i) : String((r as any)[c.key] ?? '')}
                    </td>
                  ))}
                  {rowActions && <td className="table-cell text-right" onClick={(e) => e.stopPropagation()}>{rowActions(r)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {footer}
      {/* pagination */}
      {!hidePagination && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-gray-600">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <Select size="sm" className="w-[80px]" value={limit} placeholder="" onChange={(v) => onStateChange?.({ limit: Number(v) })} options={[10, 20, 50, 100].map((n) => ({ value: n, label: String(n) }))} />
          </div>
          <div className="flex items-center gap-3">
            <span>Showing {from}-{to} of {count}</span>
            <div className="flex items-center gap-1">
              <button className="icon-btn h-7 w-7" disabled={page <= 1} onClick={() => onStateChange?.({ page: page - 1 })}><ChevronLeft className="h-4 w-4" /></button>
              <span className="px-2">{page} / {pages}</span>
              <button className="icon-btn h-7 w-7" disabled={page >= pages} onClick={() => onStateChange?.({ page: page + 1 })}><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      )}

      {/* Customize columns */}
      <Modal open={customize} onClose={() => setCustomize(false)} title="Customize Columns" size="sm" footer={<><button className="btn-outline" onClick={() => setVisible(columns.filter((c) => !c.hidden).map((c) => c.key))}>Reset</button><button className="btn-primary" onClick={() => setCustomize(false)}>Done</button></>}>
        <div className="space-y-2">
          {columns.map((c) => (
            <Checkbox key={c.key} checked={visible.includes(c.key)} onChange={(v) => setVisible((vs) => (v ? [...columns.map((x) => x.key).filter((k) => k === c.key || vs.includes(k))] : vs.filter((k) => k !== c.key)))} label={c.header} className="flex" />
          ))}
        </div>
      </Modal>
      {/* Sort dialog */}
      <Modal open={sortDlg} onClose={() => setSortDlg(false)} title="Sort" size="sm" footer={<button className="btn-primary" onClick={() => setSortDlg(false)}>Apply</button>}>
        <div className="grid grid-cols-2 gap-3">
          <Select value={state?.sortBy} placeholder="Column" onChange={(v) => onStateChange?.({ sortBy: v || undefined })} options={columns.filter((c) => c.sortable).map((c) => ({ value: c.key, label: String(c.header) }))} />
          <Select value={state?.sortOrder} placeholder="" onChange={(v) => onStateChange?.({ sortOrder: v as any })} options={[{ value: 'asc', label: 'Ascending' }, { value: 'desc', label: 'Descending' }]} />
        </div>
      </Modal>
    </div>
  );
}
