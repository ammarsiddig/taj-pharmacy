/**
 * Display label for a product that surfaces BOTH the Arabic and English names.
 * - both present and different  -> `${ar} — ${en}`
 * - only one present            -> that one
 * Display-only; never changes stored data.
 */
export function productLabel(ar?: string | null, en?: string | null): string {
  const a = (ar ?? '').trim();
  const e = (en ?? '').trim();
  if (a && e && a !== e) return `${a} — ${e}`;
  return a || e || '';
}
