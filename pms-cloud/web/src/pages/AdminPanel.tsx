import { useEffect, useState, useMemo } from 'react';
import {
  clearAdminToken,
  listTenants,
  createLicense,
  listLicenses,
  deleteLicense,
  createOwnerAccount,
  type AdminTenant,
  type AdminStats,
  type LicenseKey,
} from '../api';
import AdminTenantDetail from './AdminTenantDetail';

type AdminView = 'tenants' | 'licenses';
type DurationOption = { days: number; label: string; key: string };

const DURATIONS: DurationOption[] = [
  { days: 30, label: 'شهر', key: '1mo' },
  { days: 90, label: '3 أشهر', key: '3mo' },
  { days: 180, label: '6 أشهر', key: '6mo' },
  { days: 365, label: 'سنة', key: '1yr' },
];

interface AdminPanelProps {
  onLogout: () => void;
}

function tenantStatus(tenant: AdminTenant): { status: 'active' | 'expiring' | 'expired' | 'suspended'; label: string; color: string; bg: string } {
  if (tenant.is_suspended) {
    return { status: 'suspended', label: 'موقوف', color: '#DC2626', bg: '#FEF2F2' };
  }
  if (!tenant.expires_at) {
    return { status: 'active', label: 'نشط', color: '#059669', bg: '#F0FDF4' };
  }
  const days = Math.ceil((new Date(tenant.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) {
    return { status: 'expired', label: 'منتهي', color: '#DC2626', bg: '#FEF2F2' };
  }
  if (days <= 30) {
    return { status: 'expiring', label: `${days} يوم`, color: '#D97706', bg: '#FFFBEB' };
  }
  return { status: 'active', label: 'نشط', color: '#059669', bg: '#F0FDF4' };
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`;
  return `منذ ${Math.floor(diff / 86400)} ي`;
}

export default function AdminPanel({ onLogout }: AdminPanelProps) {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);
  const [view, setView] = useState<AdminView>('tenants');

  // Create pharmacy form state
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [durationKey, setDurationKey] = useState<string>('1yr');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [createOwnerToo, setCreateOwnerToo] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newLicenseResult, setNewLicenseResult] = useState<{ key: string; tenant_id: string; expires_at: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Search/filter
  const [searchQuery, setSearchQuery] = useState('');

  // Licenses
  const [licenses, setLicenses] = useState<LicenseKey[]>([]);
  const [licFilter, setLicFilter] = useState<'all' | 'pending' | 'used'>('all');
  const [showLicCreate, setShowLicCreate] = useState(false);
  const [licPharmacy, setLicPharmacy] = useState('');
  const [licDuration, setLicDuration] = useState<string>('1yr');
  const [licPlan, setLicPlan] = useState('basic');
  const [licMaxUsers, setLicMaxUsers] = useState(5);
  const [licMaxBranches, setLicMaxBranches] = useState(3);
  const [creatingLic, setCreatingLic] = useState(false);
  const [newLicResult, setNewLicResult] = useState<{ key: string; tenant_id: string; expires_at: string } | null>(null);
  const [copiedLic, setCopiedLic] = useState(false);

  const load = () => {
    setLoading(true);
    listTenants()
      .then((r) => {
        setTenants(r.tenants);
        // Calculate stats from tenants
        const active = r.tenants.filter(t => !t.is_suspended && (!t.expires_at || new Date(t.expires_at) > new Date())).length;
        const expiring = r.tenants.filter(t => {
          if (!t.expires_at || t.is_suspended) return false;
          const days = Math.ceil((new Date(t.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          return days > 0 && days <= 30;
        }).length;
        const expired = r.tenants.filter(t => t.expires_at && new Date(t.expires_at) < new Date()).length;
        setStats({
          total_tenants: r.tenants.length,
          total_events: 0,
          today_events: 0,
          active_tenants: active,
          expiring_soon: expiring,
          expired_tenants: expired,
        });
      })
      .catch(() => setError('تعذر تحميل البيانات'))
      .finally(() => setLoading(false));
  };

  const loadLicenses = () => {
    listLicenses().then((r) => setLicenses(r.keys)).catch(() => {});
  };

  useEffect(load, []);
  useEffect(() => { if (view === 'licenses') loadLicenses(); }, [view]);

  const filteredTenants = useMemo(() => {
    if (!searchQuery.trim()) return tenants;
    const q = searchQuery.toLowerCase();
    return tenants.filter(t =>
      (t.pharmacy_name || '').toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q) ||
      (t.owner_email || '').toLowerCase().includes(q)
    );
  }, [tenants, searchQuery]);

  const filteredLicenses = useMemo(() => {
    if (licFilter === 'all') return licenses;
    return licenses.filter(l => l.status === licFilter);
  }, [licenses, licFilter]);

  const handleCreatePharmacy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const duration = DURATIONS.find(d => d.key === durationKey) || DURATIONS[3];
      const result = await createLicense(name.trim(), duration.days);
      
      // If owner email provided, create owner account
      if (createOwnerToo && ownerEmail.trim() && ownerPassword.length >= 6) {
        try {
          await createOwnerAccount(result.tenant_id, ownerEmail.trim(), ownerPassword);
        } catch (err) {
          console.log('Owner creation failed (non-fatal):', err);
        }
      }

      setNewLicenseResult({
        key: result.key,
        tenant_id: result.tenant_id,
        expires_at: result.expires_at,
      });
      setName('');
      setOwnerEmail('');
      setOwnerPassword('');
      setCreateOwnerToo(false);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'خطأ في الإنشاء');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateLicenseOnly = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licPharmacy.trim()) return;
    setCreatingLic(true);
    try {
      const duration = DURATIONS.find(d => d.key === licDuration) || DURATIONS[3];
      const result = await createLicense(licPharmacy.trim(), duration.days, undefined, licPlan, licMaxUsers, licMaxBranches);
      setNewLicResult({
        key: result.key,
        tenant_id: result.tenant_id,
        expires_at: result.expires_at,
      });
      setLicPharmacy('');
      loadLicenses();
    } catch {
      alert('تعذر إنشاء مفتاح الترخيص');
    } finally {
      setCreatingLic(false);
    }
  };

  const copyToClipboard = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteLicense = async (key: string) => {
    if (!confirm(`حذف المفتاح ${key}؟`)) return;
    try {
      await deleteLicense(key);
      loadLicenses();
    } catch {
      alert('تعذر حذف المفتاح');
    }
  };

  const handleLogout = () => {
    clearAdminToken();
    onLogout();
  };

  if (selectedTenant) {
    return (
      <AdminTenantDetail
        tenantId={selectedTenant}
        onBack={() => setSelectedTenant(null)}
      />
    );
  }

  const ADMIN_NAV: { id: AdminView; label: string; icon: string }[] = [
    { id: 'tenants',  label: 'الصيدليات',      icon: '🏥' },
    { id: 'licenses', label: 'مفاتيح الترخيص', icon: '🔑' },
  ];

  return (
    <div className="flex min-h-dvh" style={{ background: 'var(--color-ivory-app)' }}>

      {/* ── DESKTOP: Left sidebar ── */}
      <aside
        className="hidden md:flex flex-col"
        style={{
          width: '240px',
          minHeight: '100dvh',
          background: 'var(--color-primary-950)',
          position: 'sticky',
          top: 0,
          flexShrink: 0,
        }}
      >
        <div className="px-5 py-6">
          <p className="text-white font-black text-base leading-tight">🔐 إدارة النظام</p>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>PMS Admin</p>
        </div>
        <nav className="flex flex-col gap-1 px-3 flex-1">
          {ADMIN_NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-start w-full text-sm font-medium"
              style={{
                background: view === item.id ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: view === item.id ? 'white' : 'rgba(255,255,255,0.6)',
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        {stats && (
          <div className="px-4 py-4 flex flex-col gap-1" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{stats.total_tenants} صيدلية</p>
          </div>
        )}
        <div className="p-3 flex flex-col gap-1">
          <button onClick={load} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm w-full" style={{ color: 'rgba(255,255,255,0.6)' }}>🔄 تحديث</button>
          <button onClick={handleLogout} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm w-full" style={{ color: 'rgba(255,255,255,0.6)' }}>🚪 خروج</button>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex flex-1 flex-col min-w-0">

        {/* Mobile header */}
        <header
          className="md:hidden sticky top-0 z-10 flex items-center justify-between px-4 py-3"
          style={{ background: 'var(--color-primary-950)', color: 'white', boxShadow: 'var(--shadow-card)' }}
        >
          <button onClick={handleLogout} className="text-sm opacity-70 hover:opacity-100">خروج</button>
          <span className="font-bold">🔐 لوحة إدارة النظام</span>
          <button onClick={load} className="text-sm opacity-70 hover:opacity-100">تحديث</button>
        </header>

        {/* Desktop title bar */}
        <div
          className="hidden md:flex items-center justify-between px-8 py-4"
          style={{ borderBottom: '1px solid var(--color-ivory-border)', background: 'var(--color-ivory-surface)' }}
        >
          <h1 className="text-xl font-black" style={{ color: 'var(--color-ink-main)' }}>
            {ADMIN_NAV.find(n => n.id === view)?.label}
          </h1>
          {stats && (
            <div className="flex gap-4">
              {[
                { label: 'الكل', value: stats.total_tenants },
                { label: 'نشط', value: stats.active_tenants },
                { label: 'تنتهي قريباً', value: stats.expiring_soon, warning: true },
                { label: 'منتهي', value: stats.expired_tenants, danger: true },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-base font-bold tabular-nums" style={{ color: s.danger ? '#DC2626' : s.warning ? '#D97706' : 'var(--color-primary-600)' }}>
                    {s.value.toLocaleString('en')}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mx-auto w-full max-w-4xl p-4 md:p-6 flex flex-col gap-4">

          {/* New License Result Card */}
          {newLicenseResult && (
            <div className="app-card p-5" style={{ border: '2px solid var(--color-primary-500)' }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-primary-100)' }}>
                  <span className="text-xl">✅</span>
                </div>
                <div>
                  <p className="font-bold" style={{ color: 'var(--color-ink-main)' }}>تم إنشاء الصيدلية بنجاح</p>
                  <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>انسخ المفتاح وأرسله للمالك</p>
                </div>
              </div>
              <div className="rounded-xl p-4 mb-3" style={{ background: 'var(--color-surface-secondary)', border: '1px solid var(--color-ivory-border)' }}>
                <p className="text-xs mb-2" style={{ color: 'var(--color-ink-muted)' }}>مفتاح الترخيص (License Key)</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all text-lg font-mono font-bold" dir="ltr" style={{ color: 'var(--color-primary-700)' }}>
                    {newLicenseResult.key}
                  </code>
                  <button
                    onClick={() => copyToClipboard(newLicenseResult.key, setCopiedKey)}
                    className="shrink-0 rounded-xl px-4 py-2 text-sm font-bold text-white"
                    style={{ background: copiedKey ? 'var(--color-status-success)' : 'var(--color-primary-600)' }}
                  >
                    {copiedKey ? '✓ تم' : 'نسخ المفتاح'}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 text-sm mb-3">
                <div className="rounded-xl p-3" style={{ background: 'var(--color-ivory-muted)' }}>
                  <p style={{ color: 'var(--color-ink-muted)' }}>ينتهي بتاريخ</p>
                  <p>{new Date(newLicenseResult.expires_at).toLocaleDateString('ar')}</p>
                </div>
              </div>
              <div className="rounded-xl p-3 mb-3" style={{ background: '#FFFBEB', color: '#92400E' }}>
                <strong>📱 رسالة جاهزة:</strong> مفتاح الترخيص: <code>{newLicenseResult.key}</code> — رابط التفعيل: http://178.104.158.147
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => copyToClipboard(
                    `مفتاح الترخيص: ${newLicenseResult.key}\nينتهي: ${new Date(newLicenseResult.expires_at).toLocaleDateString('ar')}`,
                    setCopiedKey
                  )}
                  className="flex-1 rounded-xl py-2.5 text-sm font-bold"
                  style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-700)' }}
                >
                  📋 نسخ الكل
                </button>
                <button onClick={() => setNewLicenseResult(null)} className="flex-1 rounded-xl py-2.5 text-sm font-bold" style={{ background: 'var(--color-surface-secondary)', color: 'var(--color-ink-muted)' }}>
                  إغلاق
                </button>
              </div>
            </div>
          )}

          {/* Licenses View */}
          {view === 'licenses' && (
            <div className="flex flex-col gap-4">
              {/* Stats */}
              {stats && (
                <div className="md:hidden grid grid-cols-4 gap-2">
                  {[
                    { label: 'الكل', value: licenses.length },
                    { label: 'قيد الانتظار', value: licenses.filter(l => l.status === 'pending').length },
                    { label: 'مستخدم', value: licenses.filter(l => l.status === 'used').length },
                  ].map((s) => (
                    <div key={s.label} className="app-card p-2 text-center">
                      <p className="text-base font-bold tabular-nums" style={{ color: 'var(--color-primary-600)' }}>{s.value}</p>
                      <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>{s.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Create License Button */}
              <button
                onClick={() => setShowLicCreate(v => !v)}
                className="app-card p-4 flex items-center justify-between"
              >
                <span className="font-semibold" style={{ color: 'var(--color-ink-main)' }}>➕ إنشاء مفتاح ترخيص</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{ color: 'var(--color-ink-muted)', transform: showLicCreate ? 'rotate(180deg)' : 'none' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {/* Create License Form */}
              {showLicCreate && (
                <form onSubmit={handleCreateLicenseOnly} className="app-card p-5 flex flex-col gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-ink-main)' }}>اسم الصيدلية</label>
                    <input
                      value={licPharmacy}
                      onChange={(e) => setLicPharmacy(e.target.value)}
                      placeholder="صيدلية..."
                      className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
                      style={{ background: 'var(--color-surface-secondary)', borderColor: 'var(--color-ivory-border)' }}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-ink-main)' }}>مدة الاشتراك</label>
                    <div className="grid grid-cols-4 gap-2">
                      {DURATIONS.map((d) => (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => setLicDuration(d.key)}
                          className="rounded-xl py-2 text-sm font-bold"
                          style={{
                            background: licDuration === d.key ? 'var(--color-primary-600)' : 'var(--color-surface-secondary)',
                            color: licDuration === d.key ? 'white' : 'var(--color-ink-muted)',
                          }}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-ink-muted)' }}>الخطة</label>
                      <select
                        value={licPlan}
                        onChange={(e) => setLicPlan(e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                        style={{ background: 'var(--color-surface-secondary)', borderColor: 'var(--color-ivory-border)' }}
                      >
                        <option value="basic">أساسي</option>
                        <option value="pro">احترافي</option>
                        <option value="enterprise">مؤسسي</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-ink-muted)' }}>أقصى مستخدمين</label>
                      <input
                        type="number"
                        min={1}
                        value={licMaxUsers}
                        onChange={(e) => setLicMaxUsers(Number(e.target.value))}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                        style={{ background: 'var(--color-surface-secondary)', borderColor: 'var(--color-ivory-border)' }}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-ink-muted)' }}>أقصى فروع</label>
                      <input
                        type="number"
                        min={1}
                        value={licMaxBranches}
                        onChange={(e) => setLicMaxBranches(Number(e.target.value))}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                        style={{ background: 'var(--color-surface-secondary)', borderColor: 'var(--color-ivory-border)' }}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={creatingLic || !licPharmacy.trim()}
                    className="rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50"
                    style={{ background: 'var(--color-primary-700)' }}
                  >
                    {creatingLic ? 'جاري الإنشاء...' : 'إنشاء المفتاح'}
                  </button>
                </form>
              )}

              {/* New License Result */}
              {newLicResult && (
                <div className="app-card p-5" style={{ border: '2px solid var(--color-primary-500)' }}>
                  <p className="font-bold mb-2" style={{ color: 'var(--color-primary-700)' }}>✅ مفتاح جديد</p>
                  <div className="rounded-xl p-3 mb-3" style={{ background: 'var(--color-surface-secondary)' }}>
                    <code className="font-mono text-lg" dir="ltr">{newLicResult.key}</code>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyToClipboard(newLicResult.key, setCopiedLic)}
                      className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white"
                      style={{ background: copiedLic ? 'var(--color-status-success)' : 'var(--color-primary-600)' }}
                    >
                      {copiedLic ? '✓ تم' : 'نسخ المفتاح'}
                    </button>
                    <button onClick={() => setNewLicResult(null)} className="flex-1 rounded-xl py-2.5 text-sm font-bold" style={{ background: 'var(--color-surface-secondary)', color: 'var(--color-ink-muted)' }}>
                      إغلاق
                    </button>
                  </div>
                </div>
              )}

              {/* Filter Tabs */}
              <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--color-surface-secondary)' }}>
                {[
                  { key: 'all', label: 'الكل' },
                  { key: 'pending', label: 'قيد الانتظار' },
                  { key: 'used', label: 'مستخدم' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setLicFilter(tab.key as typeof licFilter)}
                    className="flex-1 rounded-lg py-2 text-sm font-bold"
                    style={{
                      background: licFilter === tab.key ? 'white' : 'transparent',
                      color: licFilter === tab.key ? 'var(--color-ink-main)' : 'var(--color-ink-muted)',
                      boxShadow: licFilter === tab.key ? 'var(--shadow-soft)' : 'none',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* License List */}
              {filteredLicenses.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-4xl mb-2">🔑</p>
                  <p style={{ color: 'var(--color-ink-muted)' }}>لا توجد مفاتيح</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {filteredLicenses.map((lic) => (
                    <div key={lic.key} className="app-card p-4 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <code className="text-sm font-mono" dir="ltr" style={{ color: 'var(--color-ink-main)' }}>{lic.key}</code>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-muted)' }}>
                          {lic.pharmacy_name || lic.tenant_id}
                        </p>
                      </div>
                      <span
                        className="rounded-full px-3 py-1 text-xs font-bold"
                        style={{
                          background: lic.status === 'pending' ? '#F0FDF4' : lic.status === 'used' ? '#DBEAFE' : '#F3F4F6',
                          color: lic.status === 'pending' ? '#059669' : lic.status === 'used' ? '#2563EB' : '#6B7280',
                        }}
                      >
                        {lic.status === 'pending' ? 'قيد الانتظار' : lic.status === 'used' ? 'مستخدم' : lic.status}
                      </span>
                      {lic.expires_at && (
                        <span className="text-xs hidden md:inline" style={{ color: 'var(--color-ink-muted)' }}>
                          {new Date(lic.expires_at).toLocaleDateString('ar')}
                        </span>
                      )}
                      <button
                        onClick={() => handleDeleteLicense(lic.key)}
                        className="text-xs rounded-lg px-2 py-1 shrink-0"
                        style={{ color: 'var(--color-status-danger)', background: 'var(--color-status-danger-bg, #fee2e2)' }}
                      >
                        حذف
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tenants View (default) */}
          {view === 'tenants' && (
            <div className="flex flex-col gap-4">
              {/* Stats Cards */}
              {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'الكل', value: stats.total_tenants },
                    { label: 'نشط', value: stats.active_tenants, color: '#059669' },
                    { label: 'تنتهي قريباً', value: stats.expiring_soon, color: '#D97706' },
                    { label: 'منتهي', value: stats.expired_tenants, color: '#DC2626' },
                  ].map((s) => (
                    <div key={s.label} className="app-card p-3 text-center">
                      <p className="text-xl font-black tabular-nums" style={{ color: s.color || 'var(--color-primary-600)' }}>{s.value}</p>
                      <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>{s.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Create Pharmacy Card */}
              <button
                onClick={() => setShowCreate(v => !v)}
                className="app-card p-4 flex items-center justify-between"
              >
                <span className="font-semibold" style={{ color: 'var(--color-ink-main)' }}>➕ إضافة صيدلية جديدة</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{ color: 'var(--color-ink-muted)', transform: showCreate ? 'rotate(180deg)' : 'none' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {/* Unified Create Form */}
              {showCreate && (
                <form onSubmit={handleCreatePharmacy} className="app-card p-5 flex flex-col gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-ink-main)' }}>
                      اسم الصيدلية <span style={{ color: '#DC2626' }}>*</span>
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="صيدلية..."
                      className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
                      style={{ background: 'var(--color-surface-secondary)', borderColor: 'var(--color-ivory-border)' }}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-ink-main)' }}>
                      مدة الاشتراك
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {DURATIONS.map((d) => (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => setDurationKey(d.key)}
                          className="rounded-xl py-2 text-sm font-bold"
                          style={{
                            background: durationKey === d.key ? 'var(--color-primary-600)' : 'var(--color-surface-secondary)',
                            color: durationKey === d.key ? 'white' : 'var(--color-ink-muted)',
                          }}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="border-t pt-4" style={{ borderColor: 'var(--color-ivory-border)' }}>
                    <label className="flex items-center gap-2 mb-3">
                      <input
                        type="checkbox"
                        checked={createOwnerToo}
                        onChange={(e) => setCreateOwnerToo(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-medium" style={{ color: 'var(--color-ink-main)' }}>إنشاء حساب المالك مباشرة</span>
                    </label>
                    {createOwnerToo && (
                      <div className="flex flex-col gap-3">
                        <input
                          type="email"
                          value={ownerEmail}
                          onChange={(e) => setOwnerEmail(e.target.value)}
                          placeholder="البريد الإلكتروني للمالك"
                          className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
                          style={{ background: 'var(--color-surface-secondary)', borderColor: 'var(--color-ivory-border)' }}
                        />
                        <input
                          type="password"
                          value={ownerPassword}
                          onChange={(e) => setOwnerPassword(e.target.value)}
                          placeholder="كلمة المرور (6 أحرف على الأقل)"
                          className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
                          style={{ background: 'var(--color-surface-secondary)', borderColor: 'var(--color-ivory-border)' }}
                        />
                      </div>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={creating || !name.trim()}
                    className="rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50"
                    style={{ background: 'var(--color-primary-700)' }}
                  >
                    {creating ? 'جاري الإنشاء...' : 'إنشاء الصيدلية والمفتاح'}
                  </button>
                </form>
              )}

              {/* Search */}
              <div className="relative">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث في الصيدليات..."
                  className="w-full rounded-xl border px-4 py-3 text-sm outline-none pe-10"
                  style={{ background: 'var(--color-surface-secondary)', borderColor: 'var(--color-ivory-border)' }}
                />
                <span className="absolute end-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-ink-muted)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </span>
              </div>

              {/* Loading/Error/Empty */}
              {loading && (
                <div className="flex justify-center py-10">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-transparent" style={{ borderTopColor: 'var(--color-primary-600)' }} />
                </div>
              )}
              {!loading && error && <p className="py-6 text-center text-sm" style={{ color: 'var(--color-status-danger)' }}>{error}</p>}
              {!loading && !error && filteredTenants.length === 0 && (
                <div className="py-10 text-center">
                  <p className="text-4xl mb-2">🏥</p>
                  <p className="font-medium" style={{ color: 'var(--color-ink-main)' }}>
                    {searchQuery ? 'لا توجد نتائج للبحث' : 'لا توجد صيدليات بعد'}
                  </p>
                </div>
              )}

              {/* Tenant List */}
              {!loading && !error && filteredTenants.length > 0 && (
                <div className="flex flex-col gap-2">
                  {filteredTenants.map((tenant) => {
                    const status = tenantStatus(tenant);
                    return (
                      <button
                        key={tenant.id}
                        onClick={() => setSelectedTenant(tenant.id)}
                        className="app-card p-4 flex items-start gap-3 text-start w-full hover:shadow-md transition-shadow"
                      >
                        <div
                          className="mt-1 h-3 w-3 rounded-full shrink-0"
                          style={{ background: status.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold truncate" style={{ color: 'var(--color-ink-main)' }}>
                              {tenant.pharmacy_name || tenant.id.slice(0, 8)}
                            </p>
                            <span
                              className="rounded-full px-2 py-0.5 text-xs font-bold"
                              style={{ background: status.bg, color: status.color }}
                            >
                              {status.label}
                            </span>
                          </div>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-muted)' }}>
                            {tenant.owner_email || 'لا يوجد مالك'} · آخر نشاط: {relativeTime(tenant.last_event_at)}
                          </p>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--color-ink-muted)', transform: 'scaleX(-1)', flexShrink: 0, marginTop: 4 }}>
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
