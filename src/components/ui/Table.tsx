import { useState, useMemo, useEffect } from 'react';
import EmptyState from './EmptyState';
import { Package, ChevronUp, ChevronDown, ChevronsUpDown, ChevronRight, ChevronLeft } from 'lucide-react';

interface TableColumn<T> {
  key: string;
  header: string;
  className?: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  keyField: string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  emptyAction?: { label: string; onClick: () => void };
  pageSize?: number;
}

function compareValues<T>(a: T, b: T, key: string): number {
  const va = (a as Record<string, unknown>)[key];
  const vb = (b as Record<string, unknown>)[key];

  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;

  if (typeof va === 'number' && typeof vb === 'number') {
    return va - vb;
  }

  const sa = String(va);
  const sb = String(vb);
  return sa.localeCompare(sb, 'ar', { sensitivity: 'base', numeric: true });
}

export default function Table<T extends Record<string, unknown>>({
  columns,
  data,
  keyField,
  onRowClick,
  emptyMessage = 'لا توجد بيانات',
  emptyAction,
  pageSize,
}: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [data.length]);

  const sortedData = useMemo(() => {
    if (!sortKey) return [...data];
    return [...data].sort((a, b) => {
      const cmp = compareValues(a, b, sortKey);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const totalPages = pageSize ? Math.max(1, Math.ceil(sortedData.length / pageSize)) : 1;
  const paginatedData = pageSize
    ? sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : sortedData;

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === 'asc') {
        setSortDir('desc');
      } else {
        setSortKey(null);
        setSortDir('asc');
      }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortIcon = (col: TableColumn<T>) => {
    if (!col.sortable) return null;
    if (sortKey === col.key) {
      return sortDir === 'asc'
        ? <ChevronUp size={14} className="inline ms-1" />
        : <ChevronDown size={14} className="inline ms-1" />;
    }
    return <ChevronsUpDown size={14} className="inline ms-1 text-ink-placeholder" />;
  };

  if (data.length === 0) {
    return (
      <EmptyState
        icon={<Package size={32} />}
        title={emptyMessage}
        action={emptyAction}
      />
    );
  }

  const firstItem = (currentPage - 1) * (pageSize ?? sortedData.length) + 1;
  const lastItem = pageSize ? Math.min(currentPage * pageSize, sortedData.length) : sortedData.length;

  const pageButtons: number[] = [];
  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) pageButtons.push(i);
  } else {
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    for (let i = start; i <= end; i++) pageButtons.push(i);
  }

  return (
    <>
      <div className="app-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-ivory-muted border-b border-ivory-border">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  className={`px-4 py-2.5 text-right font-medium text-ink-muted whitespace-nowrap ${col.className || ''} ${col.sortable ? 'cursor-pointer hover:text-ink-main select-none' : ''}`}
                >
                  {col.header}
                  {sortIcon(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((row) => (
              <tr
                key={String(row[keyField])}
                className={`border-b border-ivory-border bg-ivory-surface hover:bg-primary-50 ${
                  onRowClick ? 'cursor-pointer' : ''
                }`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-2.5 whitespace-nowrap ${col.className || ''}`}>
                    {col.render ? col.render(row) : String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageSize && sortedData.length > pageSize && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-ink-muted">
            عرض {firstItem}–{lastItem} من {sortedData.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-ivory-border p-1.5 text-ink-muted hover:bg-ivory-muted disabled:opacity-50"
            >
              <ChevronRight size={14} />
            </button>
            {pageButtons.map((p) => (
              <button
                key={p}
                onClick={() => setCurrentPage(p)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                  p === currentPage
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'border-ivory-border text-ink-muted hover:bg-ivory-muted'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-lg border border-ivory-border p-1.5 text-ink-muted hover:bg-ivory-muted disabled:opacity-50"
            >
              <ChevronLeft size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
