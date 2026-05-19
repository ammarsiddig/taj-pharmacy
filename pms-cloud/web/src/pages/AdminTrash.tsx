import { useTrash, useRestoreTenant } from '../hooks/admin';
import type { AdminTenant } from '../api';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AdminTrash() {
  const { data, isLoading, isError } = useTrash();
  const restore = useRestoreTenant();
  const tenants: AdminTenant[] = data?.tenants || [];

  async function handleRestore(id: string) {
    if (!confirm('هل تريد استعادة هذه الصيدلية؟')) return;
    await restore.mutateAsync(id);
  }

  return (
    <div className="flex flex-col gap-4" dir="rtl">
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
          <EmptyState icon="trash" title="لا توجد بيانات محذوفة" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-ivory-border)', background: 'var(--color-ivory-muted)' }}>
                {['اسم الصيدلية', 'تاريخ الإنشاء', 'تاريخ الحذف', ''].map((h) => (
                  <th key={h} className="text-start px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--color-ink-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--color-ivory-border)' }}>
                  <td className="px-4 py-2.5 font-medium">{t.pharmacy_name || t.id}</td>
                  <td className="px-4 py-2.5 tabular-nums">{fmt(t.first_seen_at)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{fmt(t.last_sync_at)}</td>
                  <td className="px-4 py-2.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleRestore(t.id)}
                      disabled={restore.isPending}
                    >
                      استعادة
                    </Button>
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
