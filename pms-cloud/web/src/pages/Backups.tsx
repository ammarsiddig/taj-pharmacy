import { useEffect, useState } from 'react';
import { getBackups, downloadBackup, type BackupRow } from '../api';
import Icon from '../components/ui/Icon';
import Skeleton from '../components/ui/Skeleton';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' });
}

export default function Backups() {
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true); setError('');
    getBackups().then(data => setBackups(data.backups || [])).catch(() => setError('تعذر تحميل النسخ الاحتياطية')).finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold" style={{ color: 'var(--color-ink-main)' }}>النسخ الاحتياطية السحابية</h2>
        <button onClick={load} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium" style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-700)' }}>
          <Icon name="refresh" size={14} /> تحديث
        </button>
      </div>

      {loading && <div className="flex flex-col gap-3">{[...Array(3)].map((_, i) => <Skeleton key={i} height="64px" rounded="md" />)}</div>}

      {!loading && error && (
        <div className="py-12 text-center">
          <Icon name="exclamation" size={40} style={{ color: 'var(--color-ink-placeholder)' }} />
          <p className="mt-2 font-medium" style={{ color: 'var(--color-ink-main)' }}>{error}</p>
        </div>
      )}

      {!loading && backups.length === 0 && (
        <div className="app-card py-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'var(--color-ivory-muted)' }}>
            <Icon name="upload" size={22} style={{ color: 'var(--color-ink-muted)' }} />
          </div>
          <p className="font-semibold" style={{ color: 'var(--color-ink-main)' }}>لا توجد نسخ احتياطية</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-ink-muted)' }}>يتم رفع النسخ تلقائياً من تطبيق الصيدلية كل 24 ساعة</p>
        </div>
      )}

      {!loading && backups.length > 0 && (
        <div className="app-panel overflow-hidden">
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-ivory-border)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-ink-main)' }}>{backups.length} نسخة احتياطية</p>
          </div>
          {backups.map((b, i) => (
            <div key={b.id} className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: i < backups.length - 1 ? '1px solid var(--color-ivory-border)' : 'none' }}>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setDownloadingId(b.id); downloadBackup(b.id).catch(() => setError('فشل تحميل النسخة الاحتياطية')).finally(() => setDownloadingId(null)); }}
                  disabled={downloadingId === b.id}
                  className="flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-50"
                  style={{ background: 'var(--color-ivory-muted)', cursor: 'pointer' }}
                  title="تحميل النسخة الاحتياطية"
                >
                  <Icon name={downloadingId === b.id ? 'refresh' : 'download'} size={16} className={downloadingId === b.id ? 'animate-spin' : ''} style={{ color: 'var(--color-primary-600)' }} />
                </button>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--color-ink-main)' }} dir="ltr">{b.id.slice(0, 8)}...</p>
                  <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>{formatDate(b.created_at)}</p>
                </div>
              </div>
              <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-700)' }}>{formatSize(b.file_size)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-secondary)', border: '1px solid var(--color-ivory-border)' }}>
        <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>
          <Icon name="shield-check" size={14} className="inline" style={{ color: 'var(--color-ink-muted)' }} /> النسخ الاحتياطية مشفرة. يتم الاحتفاظ بآخر 10 نسخ لكل صيدلية.
        </p>
      </div>
    </div>
  );
}
