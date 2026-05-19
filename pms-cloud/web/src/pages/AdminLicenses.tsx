import { useState } from 'react';
import { useLicenses } from '../hooks/admin';
import type { LicenseKey } from '../api';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import Badge from '../components/ui/Badge';

function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'expired') return 'danger';
  if (status === 'suspended') return 'warning';
  return 'neutral';
}

const STATUS_LABELS: Record<string, string> = {
  active: 'نشط', expired: 'منتهي', suspended: 'موقوف', pending: 'معلق',
};

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
}

const STATUS_OPTIONS = [
  { value: '', label: 'الكل' },
  { value: 'active', label: 'نشط' },
  { value: 'pending', label: 'معلق' },
  { value: 'expired', label: 'منتهي' },
  { value: 'suspended', label: 'موقوف' },
];

export default function AdminLicenses() {
  const [statusFilter, setStatusFilter] = useState('');
  const { data, isLoading, isError } = useLicenses();

  const keys: LicenseKey[] = (data?.keys || []).filter(
    (k) => !statusFilter || k.status === statusFilter,
  );

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className="rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{
              background: statusFilter === opt.value ? 'var(--color-primary-600)' : 'var(--color-ivory-muted)',
              color: statusFilter === opt.value ? 'white' : 'var(--color-ink-muted)',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div
        className="rounded-xl border overflow-x-auto"
        style={{ borderColor: 'var(--color-ivory-border)', background: 'var(--color-ivory-surface)' }}
      >
        {isLoading ? (
          <div className="p-4 flex flex-col gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} height="40px" rounded="md" />)}
          </div>
        ) : isError ? (
          <EmptyState icon="exclamation" title="فشل تحميل البيانات" />
        ) : keys.length === 0 ? (
          <EmptyState icon="shield-check" title="لا توجد تراخيص" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-ivory-border)', background: 'var(--color-ivory-muted)' }}>
                {['مفتاح الترخيص', 'الصيدلية', 'الحالة', 'تاريخ الإنشاء', 'تاريخ الانتهاء'].map((h) => (
                  <th key={h} className="text-start px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--color-ink-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.key} style={{ borderBottom: '1px solid var(--color-ivory-border)' }}>
                  <td className="px-4 py-2.5 font-mono text-xs">{k.key}</td>
                  <td className="px-4 py-2.5">{k.pharmacy_name || '—'}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={statusVariant(k.status)}>{STATUS_LABELS[k.status] || k.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{fmt(k.created_at)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{fmt(k.expires_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
