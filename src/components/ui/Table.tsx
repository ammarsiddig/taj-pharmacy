interface TableColumn<T> {
  key: string;
  header: string;
  className?: string;
  render?: (row: T) => React.ReactNode;
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  keyField: string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

export default function Table<T extends Record<string, unknown>>({
  columns,
  data,
  keyField,
  onRowClick,
  emptyMessage = 'لا توجد بيانات',
}: TableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-ink-muted text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="app-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-ivory-muted border-b border-ivory-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-2.5 text-right font-medium text-ink-muted whitespace-nowrap ${col.className || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
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
  );
}
