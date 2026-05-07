/**
 * Convert array of objects to CSV string and trigger download.
 */
export function exportToCsv(filename: string, rows: Record<string, unknown>[], headers?: string[]) {
  if (rows.length === 0) return;

  const keys = headers || Object.keys(rows[0]);

  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvLines = [
    keys.join(','),
    ...rows.map(row => keys.map(k => escape(row[k])).join(',')),
  ];

  const csvString = '\uFEFF' + csvLines.join('\n'); // BOM for Excel Arabic support
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Format piasters to decimal for CSV (no formatting, just divide by 100).
 */
export function moneyRaw(piasters: number): number {
  return piasters / 100;
}
