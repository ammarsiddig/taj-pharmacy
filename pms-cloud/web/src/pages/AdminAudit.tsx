import { useState } from 'react';
import { useAuditLog } from '../hooks/admin';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';

interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  tenant_id: string | null;
  target_type: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  renew: 'تجديد',
  suspend: 'تعليق',
  unsuspend: 'رفع التعليق',
  delete: 'حذف',
  hard_delete: 'حذف نهائي',
  restore: 'استعادة',
  revoke_token: 'إلغاء رمز',
  create_license: 'إنشاء ترخيص',
  create_tenant: 'إنشاء صيدلية',
  update_tenant: 'تعديل صيدلية',
};

const ACTION_COLOR: Record<string, string> = {
  renew: '#059669',
  restore: '#059669',
  unsuspend: '#059669',
  create_license: '#2563eb',
  create_tenant: '#2563eb',
  update_tenant: '#2563eb',
  delete: '#dc2626',
  hard_delete: '#dc2626',
  suspend: '#d97706',
  revoke_token: '#d97706',
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('ar-SA', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function AdminAudit() {
  const [tenantSearch, setTenantSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useAuditLog(tenantSearch.trim() || undefined);

  const entries: AuditEntry[] = data?.entries || [];
  const total: number = data?.total || 0;
  const limit: number = data?.limit || 50;

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      {/* Search by tenant */}
      <div className="flex gap-2 items-center">
        <input
          type="search"
          value={tenantSearch}
          onChange={(e) => { setTenantSearch(e.target.value); setPage(1); }}
          placeholder="تصفية بمعرّف الصيدلية..."
          className="rounded-xl border px-4 py-2.5 text-sm outline-none"
          style={{
            background: 'var(--color-ivory-surface)',
            borderColor: 'var(--color-ivory-border)',
            width: '280px',
          }}
        />
        {tenantSearch && (
          <button
            onClick={() => setTenantSearch('')}
            className="text-xs px-3 py-2"
            style={{ color: 'var(--color-ink-muted)' }}
          >
            مسح
          </button>
        )}
      </div>

      {/* Table */}
      <div
        className="rounded-xl border overflow-x-auto"
        style={{ borderColor: 'var(--color-ivory-border)', background: 'var(--color-ivory-surface)' }}
      >
        {isLoading ? (
          <div className="p-4 flex flex-col gap-3">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height="40px" rounded="md" />)}
          </div>
        ) : isError ? (
          <EmptyState icon="exclamation" title="فشل تحميل البيانات" />
        ) : entries.length === 0 ? (
          <EmptyState icon="document-text" title="لا توجد أحداث في السجل" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-ivory-border)', background: 'var(--color-ivory-muted)' }}>
                {['الوقت', 'المنفّذ', 'الإجراء', 'الصيدلية', 'الهدف', 'التفاصيل'].map((h) => (
                  <th key={h} className="text-start px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--color-ink-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--color-ivory-border)' }}>
                  <td className="px-4 py-2.5 tabular-nums text-xs whitespace-nowrap">{fmt(e.created_at)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{e.actor}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className="font-medium text-xs"
                      style={{ color: ACTION_COLOR[e.action] || 'var(--color-ink-main)' }}
                    >
                      {ACTION_LABELS[e.action] || e.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {e.tenant_id ? `${e.tenant_id.slice(0, 8)}…` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs">{e.target_type || '—'}</td>
                  <td
                    className="px-4 py-2.5 font-mono text-xs"
                    style={{
                      color: 'var(--color-ink-muted)',
                      maxWidth: '200px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {Object.keys(e.payload || {}).length > 0 ? JSON.stringify(e.payload) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>السابق</Button>
          <span className="text-sm" style={{ color: 'var(--color-ink-muted)' }}>صفحة {page} · {total} حدث</span>
          <Button size="sm" variant="secondary" disabled={page * limit >= total} onClick={() => setPage((p) => p + 1)}>التالي</Button>
        </div>
      )}
    </div>
  );
}
