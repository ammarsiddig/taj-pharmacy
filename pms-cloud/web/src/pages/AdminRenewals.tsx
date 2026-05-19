import { useState } from 'react';
import { useRenewals } from '../hooks/admin';
import type { AdminTenant } from '../api';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';

interface RenewalTenant extends AdminTenant {
  days_remaining?: number;
  current_plan?: string;
}

const DAY_OPTIONS = [7, 14, 30, 60];

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function daysColor(days: number): string {
  if (days < 7) return 'var(--color-status-error)';
  if (days < 30) return '#d97706';
  return 'var(--color-ink-main)';
}

export default function AdminRenewals() {
  const [days, setDays] = useState(30);
  const { data, isLoading, isError } = useRenewals(days);
  const tenants: RenewalTenant[] = data?.tenants || [];

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>تنتهي خلال:</span>
        {DAY_OPTIONS.map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className="rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{
              background: days === d ? 'var(--color-primary-600)' : 'var(--color-ivory-muted)',
              color: days === d ? 'white' : 'var(--color-ink-muted)',
            }}
          >
            {d} يوم
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
        ) : tenants.length === 0 ? (
          <EmptyState icon="clock" title={`لا توجد تراخيص تنتهي خلال ${days} يوم`} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-ivory-border)', background: 'var(--color-ivory-muted)' }}>
                {['الصيدلية', 'الخطة', 'تاريخ الانتهاء', 'الأيام المتبقية'].map((h) => (
                  <th key={h} className="text-start px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--color-ink-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--color-ivory-border)' }}>
                  <td className="px-4 py-2.5 font-medium">{t.pharmacy_name || t.id}</td>
                  <td className="px-4 py-2.5">{t.current_plan || '—'}</td>
                  <td className="px-4 py-2.5 tabular-nums">{fmt(t.expires_at)}</td>
                  <td
                    className="px-4 py-2.5 tabular-nums font-bold"
                    style={{ color: daysColor(t.days_remaining ?? 999) }}
                  >
                    {t.days_remaining != null ? `${t.days_remaining} يوم` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
