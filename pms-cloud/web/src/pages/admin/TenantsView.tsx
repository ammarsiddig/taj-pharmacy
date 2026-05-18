import { useState } from 'react';
import { useTenants, useSuspend, useDeleteTenant } from '../../hooks/admin';
import type { AdminTenant } from '../../api';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import Icon from '../../components/ui/Icon';

interface Props {
  onSelect: (id: string) => void;
  onCreateClick: () => void;
}

function statusBadge(tenant: AdminTenant): { variant: 'success' | 'warning' | 'danger' | 'neutral'; label: string } {
  if (tenant.is_suspended) return { variant: 'danger', label: 'موقوف' };
  if (!tenant.expires_at) return { variant: 'success', label: 'نشط' };
  const days = Math.ceil((new Date(tenant.expires_at).getTime() - Date.now()) / 86400000);
  if (days < 0) return { variant: 'danger', label: 'منتهي' };
  if (days <= 30) return { variant: 'warning', label: `${days} يوم` };
  return { variant: 'success', label: 'نشط' };
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`;
  return `منذ ${Math.floor(diff / 86400)} يوم`;
}

export default function TenantsView({ onSelect, onCreateClick }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [suspendId, setSuspendId] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const params: Record<string, string> = { page: String(page), limit: '50' };
  if (statusFilter) params.status = statusFilter;
  if (search.trim()) params.q = search;

  const { data, isLoading, isError } = useTenants(params);
  const suspend = useSuspend();
  const deleteTenant = useDeleteTenant();
  const tenants = data?.tenants || [];
  const total = data?.total || 0;

  const statusOptions = ['', 'active', 'expiring', 'expired', 'suspended', 'no_owner'];
  const statusLabels: Record<string, string> = {
    '': 'الكل', active: 'نشط', expiring: 'ينتهي قريباً', expired: 'منتهي', suspended: 'موقوف', no_owner: 'بدون مالك',
  };

  async function handleSuspend() {
    if (!suspendId) return;
    await suspend.mutateAsync({ id: suspendId, is_suspended: true, suspended_reason: suspendReason || undefined });
    setSuspendId(null);
    setSuspendReason('');
  }

  async function handleDelete() {
    if (!deleteId) return;
    await deleteTenant.mutateAsync({ id: deleteId, hard: false });
    setDeleteId(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={onCreateClick} size="sm">+ صيدلية جديدة</Button>
        <div className="flex-1" />
        <div className="flex gap-1 flex-wrap">
          {statusOptions.map(s => (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${statusFilter === s ? 'bg-primary-600 text-white' : ''}`}
              style={{ background: statusFilter === s ? 'var(--color-primary-600)' : 'var(--color-ivory-muted)', color: statusFilter === s ? 'white' : 'var(--color-ink-muted)' }}>
              {statusLabels[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="بحث في الصيدليات..." className="w-full rounded-xl border px-4 py-3 text-sm outline-none pe-10"
          style={{ background: 'var(--color-ivory-surface)', borderColor: 'var(--color-ivory-border)' }} />
        <span className="absolute end-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-ink-muted)' }}>
          <Icon name="search" size={16} />
        </span>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col gap-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} height="80px" rounded="md" />)}
        </div>
      )}

      {/* Error */}
      {isError && <EmptyState icon="exclamation" title="تعذر تحميل البيانات" />}

      {/* Empty */}
      {!isLoading && !isError && tenants.length === 0 && (
        <EmptyState icon="package" title={search ? 'لا توجد نتائج للبحث' : 'لا توجد صيدليات بعد'} />
      )}

      {/* Tenant Cards */}
      {!isLoading && !isError && tenants.length > 0 && (
        <>
          <div className="flex flex-col gap-2">
            {tenants.map(tenant => {
              const sb = statusBadge(tenant);
              return (
                <div key={tenant.id} className="app-card p-4 flex items-start gap-3">
                  <div className="mt-1 h-3 w-3 rounded-full shrink-0" style={{ background: sb.variant === 'success' ? '#059669' : sb.variant === 'warning' ? '#D97706' : '#DC2626' }} />
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelect(tenant.id)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold truncate" style={{ color: 'var(--color-ink-main)' }}>
                        {tenant.pharmacy_name || tenant.id.slice(0, 8)}
                      </p>
                      <Badge variant={sb.variant}>{sb.label}</Badge>
                      {tenant.current_plan && tenant.current_plan !== 'basic' && <Badge variant="info">{tenant.current_plan}</Badge>}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-muted)' }}>
                      {tenant.owner_email || 'لا يوجد مالك'} · آخر نشاط: {relativeTime(tenant.last_sync_at)}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setSuspendId(tenant.id)} title="تعليق"
                      className="touch-target flex items-center justify-center rounded-lg hover:bg-ivory-muted" style={{ color: 'var(--color-ink-muted)' }}>
                      <Icon name="minus-circle" size={16} />
                    </button>
                    <button onClick={() => setDeleteId(tenant.id)} title="حذف"
                      className="touch-target flex items-center justify-center rounded-lg hover:bg-ivory-muted" style={{ color: 'var(--color-status-danger)' }}>
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {total > 50 && (
            <div className="flex items-center justify-between">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>السابق</Button>
              <span className="text-sm" style={{ color: 'var(--color-ink-muted)' }}>صفحة {page}</span>
              <Button size="sm" variant="secondary" disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}>التالي</Button>
            </div>
          )}
        </>
      )}

      {/* Suspend Modal */}
      <Modal open={!!suspendId} onClose={() => { setSuspendId(null); setSuspendReason(''); }} title="تعليق الصيدلية">
        <div className="flex flex-col gap-3">
          <input value={suspendReason} onChange={e => setSuspendReason(e.target.value)} placeholder="سبب التعليق (اختياري)"
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
            style={{ background: 'var(--color-ivory-muted)', borderColor: 'var(--color-ivory-border)' }} />
          <div className="flex gap-2">
            <Button onClick={handleSuspend} loading={suspend.isPending} variant="danger">تعليق</Button>
            <Button onClick={() => { setSuspendId(null); setSuspendReason(''); }} variant="ghost">إلغاء</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="حذف الصيدلية">
        <div className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: 'var(--color-ink-muted)' }}>سيتم نقل الصيدلية إلى سلة المحذوفات. يمكن استعادتها لاحقاً.</p>
          <Button onClick={handleDelete} loading={deleteTenant.isPending} variant="danger">تأكيد الحذف</Button>
          <Button onClick={() => setDeleteId(null)} variant="ghost">إلغاء</Button>
        </div>
      </Modal>
    </div>
  );
}
