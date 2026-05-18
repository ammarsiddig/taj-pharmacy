import { type ReactNode } from 'react';
import { useOverview, useDownloadLink } from '../../hooks/admin';
import Icon from '../../components/ui/Icon';

interface AdminShellProps {
  view: string;
  onNavigate: (v: string) => void;
  onLogout: () => void;
  children: ReactNode;
}

const NAV: { id: string; label: string; icon: string }[] = [
  { id: 'tenants',  label: 'الصيدليات',      icon: 'package' },
  { id: 'licenses', label: 'مفاتيح الترخيص', icon: 'shield-check' },
  { id: 'renewals', label: 'التجديدات',       icon: 'clock' },
  { id: 'trash',    label: 'المحذوفات',       icon: 'trash' },
  { id: 'audit',    label: 'سجل التدقيق',     icon: 'document-text' },
];

export default function AdminShell({ view, onNavigate, onLogout, children }: AdminShellProps) {
  const { data: overview } = useOverview();
  const { data: dl } = useDownloadLink();
  const stats = overview?.stats;

  return (
    <div className="flex min-h-dvh" style={{ background: 'var(--color-ivory-app)' }}>
      {/* Sidebar */}
      <aside
        className="hidden md:flex flex-col"
        style={{ width: '240px', minHeight: '100dvh', background: 'var(--color-primary-950)', position: 'sticky', top: 0, flexShrink: 0 }}
      >
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white">
            <img src="/taj-logo.svg" alt="TAJ Pharmacy" className="h-10 w-10 object-contain" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-black text-base leading-tight">إدارة النظام</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>TAJ Admin</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1 px-3 flex-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-start w-full text-sm font-medium"
              style={{
                background: view === item.id ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: view === item.id ? 'white' : 'rgba(255,255,255,0.6)',
              }}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {stats && (
          <div className="px-4 py-3 flex flex-col gap-1" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{stats.total_tenants} صيدلية</p>
            <div className="flex gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              <span>{stats.active_tenants} نشط</span>
              <span>{stats.expiring_soon} منتهي قريباً</span>
            </div>
          </div>
        )}

        {dl && dl.url && (
          <div className="px-4 pb-3 flex flex-col gap-1" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="pt-3 flex items-center gap-2">
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>رابط التحميل</span>
              {dl.version && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)' }}>v{dl.version}</span>
              )}
            </div>
            <button
              onClick={() => { navigator.clipboard.writeText(dl.url); }}
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs w-full text-start truncate"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)' }}
              title={dl.url}
            >
              <span className="truncate">{dl.url}</span>
              <span className="shrink-0">📋</span>
            </button>
          </div>
        )}

        <div className="p-3 flex flex-col gap-1">
          <button onClick={onLogout} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm w-full" style={{ color: 'rgba(255,255,255,0.6)' }}>🚪 خروج</button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0">
        <header
          className="sticky top-0 z-10 flex items-center justify-between px-4 md:px-8 py-3 md:py-4"
          style={{ borderBottom: '1px solid var(--color-ivory-border)', background: 'var(--color-ivory-surface)' }}
        >
          <div className="flex items-center gap-3">
            <div className="md:hidden flex items-center gap-2">
              <img src="/taj-logo.svg" alt="TAJ" className="h-8 w-8" />
              <span className="font-bold">إدارة</span>
            </div>
            <h1 className="hidden md:block text-xl font-black" style={{ color: 'var(--color-ink-main)' }}>
              {NAV.find(n => n.id === view)?.label || ''}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {stats && (
              <div className="hidden md:flex gap-4">
                {[
                  { label: 'الكل', value: stats.total_tenants },
                  { label: 'نشط', value: stats.active_tenants },
                  { label: 'تنتهي', value: stats.expiring_soon },
                  { label: 'غير نشط', value: stats.inactive_tenants },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <p className="text-base font-bold tabular-nums" style={{ color: 'var(--color-primary-600)' }}>{String(s.value)}</p>
                    <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>{s.label}</p>
                  </div>
                ))}
              </div>
            )}
            <button onClick={onLogout} className="md:hidden text-sm" style={{ color: 'var(--color-ink-muted)' }}>خروج</button>
          </div>
        </header>

        {/* Mobile bottom nav */}
        <nav className="md:hidden bottom-nav fixed bottom-0 inset-x-0 z-20 flex items-stretch" style={{ background: 'var(--color-ivory-surface)', borderTop: '1px solid var(--color-ivory-border)' }}>
          {NAV.slice(0, 5).map((item) => {
            const active = view === item.id;
            return (
              <button key={item.id} onClick={() => onNavigate(item.id)} className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2" style={{ color: active ? 'var(--color-primary-600)' : 'var(--color-ink-muted)', minHeight: '56px' }}>
                <Icon name={item.icon} size={18} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8">
          {children}
        </main>
      </div>
    </div>
  );
}
