import { useEffect, useState } from 'react';
import {
  getTenantDetail,
  generateToken,
  revokeToken,
  updateTenant,
  deleteTenant,
  createOwnerAccount,
  sendAnnouncement,
  renewTenant,
  getTenantLicenses,
  createTenantLicense,
  deleteLicense,
  type AdminTenantDetail as TenantDetail,
  type LicenseKey,
} from '../api';

interface Props {
  tenantId: string;
  onBack: () => void;
}

function fmt(fils: number): string {
  return (fils / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function relDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - Date.now();
  const days = Math.round(diff / 86_400_000);
  if (days < 0) return `انتهى منذ ${Math.abs(days)} يوم`;
  if (days === 0) return 'ينتهي اليوم';
  return `ينتهي خلال ${days} يوم`;
}

const EVENT_EMOJI: Record<string, string> = {
  sale_created: '🛒', return_created: '↩️', product_created: '💊',
  product_updated: '✏️', customer_created: '👤', supplier_created: '🏭',
  snapshot: '📸', refresh_request: '🔄', expense_created: '💸',
};

export default function AdminTenantDetail({ tenantId, onBack }: Props) {
  const [detail, setDetail] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newToken, setNewToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const [expiryInput, setExpiryInput] = useState('');
  const [savingExpiry, setSavingExpiry] = useState(false);
  const [togglingSuspend, setTogglingSuspend] = useState(false);

  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [creatingOwner, setCreatingOwner] = useState(false);
  const [ownerMsg, setOwnerMsg] = useState('');

  const [annMessage, setAnnMessage] = useState('');
  const [annType, setAnnType] = useState<'info' | 'warning' | 'danger'>('info');
  const [sendingAnn, setSendingAnn] = useState(false);
  const [annMsg, setAnnMsg] = useState('');

  const load = () => {
    setLoading(true);
    getTenantDetail(tenantId)
      .then((d) => {
        setDetail(d);
        if (d.tenant.expires_at) {
          setExpiryInput(d.tenant.expires_at.slice(0, 10));
        }
      })
      .catch(() => setError('تعذر تحميل بيانات الصيدلية'))
      .finally(() => setLoading(false));
    getTenantLicenses(tenantId)
      .then((r) => setLicenseKeys(r.keys))
      .catch(() => {});
  };

  const handleGenerateLicense = async (days: number) => {
    setGeneratingLicense(true);
    try {
      await createTenantLicense(tenantId, days);
      const r = await getTenantLicenses(tenantId);
      setLicenseKeys(r.keys);
    } catch { alert('تعذر إنشاء مفتاح الترخيص'); }
    finally { setGeneratingLicense(false); }
  };

  const handleDeleteLicKey = async (key: string) => {
    if (!confirm(`حذف المفتاح ${key}؟`)) return;
    setDeletingLicKey(key);
    try {
      await deleteLicense(key);
      setLicenseKeys((prev) => prev.filter((k) => k.key !== key));
    } catch { alert('تعذر حذف المفتاح'); }
    finally { setDeletingLicKey(null); }
  };

  useEffect(load, [tenantId]);

  const handleGenerate = async () => {
    try {
      const result = await generateToken(tenantId, 'generated');
      setNewToken(result.token);
      load();
    } catch {
      alert('تعذر إنشاء رمز جديد');
    }
  };

  const handleRevoke = async (token: string) => {
    if (!confirm('هل تريد إلغاء هذا الرمز؟')) return;
    setRevoking(token);
    try { await revokeToken(token); load(); }
    catch { alert('تعذر إلغاء الرمز'); }
    finally { setRevoking(null); }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleSuspend = async () => {
    if (!detail) return;
    const isSuspended = detail.tenant.is_suspended;
    const msg = isSuspended ? 'هل تريد إعادة تفعيل هذه الصيدلية؟' : 'هل تريد تعليق هذه الصيدلية؟ لن يتمكن المالك من تسجيل الدخول.';
    if (!confirm(msg)) return;
    setTogglingSuspend(true);
    try {
      const res = await updateTenant(tenantId, { is_suspended: !isSuspended });
      setDetail((prev) => prev ? { ...prev, tenant: { ...prev.tenant, ...res.tenant } } : prev);
    } catch { alert('تعذر تحديث حالة الصيدلية'); }
    finally { setTogglingSuspend(false); }
  };

  const handleSaveExpiry = async () => {
    if (!expiryInput) return;
    setSavingExpiry(true);
    try {
      const res = await updateTenant(tenantId, { expires_at: new Date(expiryInput).toISOString() });
      setDetail((prev) => prev ? { ...prev, tenant: { ...prev.tenant, ...res.tenant } } : prev);
    } catch { alert('تعذر حفظ تاريخ الانتهاء'); }
    finally { setSavingExpiry(false); }
  };

  const handleCreateOwner = async () => {
    if (!ownerEmail || !ownerPassword) return;
    setCreatingOwner(true);
    setOwnerMsg('');
    try {
      const res = await createOwnerAccount(tenantId, ownerEmail, ownerPassword);
      setOwnerMsg(`✅ تم إنشاء حساب المالك: ${res.email}`);
      setOwnerEmail(''); setOwnerPassword('');
      load();
    } catch (e) {
      setOwnerMsg(`❌ ${e instanceof Error ? e.message : 'خطأ'}`);
    } finally { setCreatingOwner(false); }
  };

  const handleSendAnnouncement = async () => {
    if (!annMessage.trim()) return;
    setSendingAnn(true);
    setAnnMsg('');
    try {
      await sendAnnouncement(tenantId, annMessage.trim(), annType);
      setAnnMsg('✅ تم إرسال الإشعار');
      setAnnMessage('');
    } catch {
      setAnnMsg('❌ تعذر الإرسال');
    } finally { setSendingAnn(false); }
  };

  // Renewal state
  const [showRenew, setShowRenew] = useState(false);
  const [renewDays, setRenewDays] = useState<string>('365');
  const [renewing, setRenewing] = useState(false);
  const [renewMsg, setRenewMsg] = useState('');
  const [activeRenewDays, setActiveRenewDays] = useState<string | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [deleting, setDeleting] = useState(false);

  const [licenseKeys, setLicenseKeys] = useState<LicenseKey[]>([]);
  const [generatingLicense, setGeneratingLicense] = useState(false);
  const [copiedLicKey, setCopiedLicKey] = useState<string | null>(null);
  const [deletingLicKey, setDeletingLicKey] = useState<string | null>(null);

  const handleRenew = async (daysOverride?: number) => {
    const days = daysOverride ?? parseInt(renewDays);
    if (!days || days < 1) return;
    setActiveRenewDays(String(days));
    setRenewing(true);
    setRenewMsg('');
    try {
      const result = await renewTenant(tenantId, days);
      setRenewMsg(`✅ تم تجديد الاشتراك حتى ${new Date(result.expires_at).toLocaleDateString('ar')}`);
      load();
    } catch {
      setRenewMsg('❌ تعذر التجديد');
    } finally { setRenewing(false); setActiveRenewDays(null); }
  };

  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    setSavingName(true);
    try {
      const res = await updateTenant(tenantId, { pharmacy_name: nameInput.trim() });
      setDetail((prev) => prev ? { ...prev, tenant: { ...prev.tenant, ...res.tenant } } : prev);
      setEditingName(false);
    } catch { alert('تعذر حفظ الاسم'); }
    finally { setSavingName(false); }
  };

  const handleDelete = async () => {
    if (!confirm('⚠️ هل أنت متأكد؟ سيتم حذف الصيدلية وجميع بياناتها نهائياً.')) return;
    if (!confirm('تأكيد أخير: هذا الإجراء لا يمكن التراجع عنه.')) return;
    setDeleting(true);
    try {
      await deleteTenant(tenantId);
      onBack();
    } catch { alert('تعذر حذف الصيدلية'); setDeleting(false); }
  };

  const tenant = detail?.tenant;
  const isSuspended = tenant?.is_suspended ?? false;
  const hasOwner = !!tenant?.owner_email;

  return (
    <div className="min-h-dvh" style={{ background: 'var(--color-ivory-app)' }}>
      <header
        className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{ background: 'var(--color-primary-950)', color: 'white', boxShadow: 'var(--shadow-card)' }}
      >
        <button onClick={onBack} className="flex items-center gap-1 text-sm opacity-70 hover:opacity-100">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          رجوع
        </button>
        <span className="flex-1 text-center font-bold truncate">{tenant?.pharmacy_name || tenantId}</span>
        <button onClick={load} className="text-sm opacity-70 hover:opacity-100">تحديث</button>
      </header>

      <div className="mx-auto max-w-2xl p-4 flex flex-col gap-4">
        {loading && (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-transparent" style={{ borderTopColor: 'var(--color-primary-600)' }} />
          </div>
        )}
        {error && <p className="py-6 text-center text-sm" style={{ color: 'var(--color-status-danger)' }}>{error}</p>}

        {detail && (
          <>
            {/* ── Pharmacy Info Card ── */}
            <div className="app-card p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                {editingName ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      autoFocus
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      className="flex-1 rounded-xl border px-3 py-1.5 text-sm font-bold"
                      style={{ borderColor: 'var(--color-primary-600)', color: 'var(--color-ink-main)', background: 'var(--color-ivory-50)' }}
                    />
                    <button onClick={handleSaveName} disabled={savingName || !nameInput.trim()} className="rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: 'var(--color-primary-600)', opacity: savingName || !nameInput.trim() ? 0.5 : 1 }}>
                      {savingName ? '...' : 'حفظ'}
                    </button>
                    <button onClick={() => setEditingName(false)} className="rounded-lg px-3 py-1.5 text-xs" style={{ color: 'var(--color-ink-muted)' }}>إلغاء</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-base" style={{ color: 'var(--color-ink-main)' }}>
                      🏥 {tenant?.pharmacy_name || tenantId}
                    </p>
                    <button onClick={() => { setNameInput(tenant?.pharmacy_name || ''); setEditingName(true); }} className="text-xs rounded-lg px-2 py-1" style={{ color: 'var(--color-ink-muted)', background: 'var(--color-surface-secondary)' }}>✏️ تعديل</button>
                  </div>
                )}
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                  style={{
                    background: isSuspended ? 'var(--color-status-danger-bg, #fee2e2)' : 'var(--color-status-success-bg)',
                    color: isSuspended ? 'var(--color-status-danger)' : 'var(--color-status-success)',
                  }}
                >
                  {isSuspended ? 'موقوف' : 'نشط'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>المالك</p>
                  <p style={{ color: 'var(--color-ink-main)' }}>{tenant?.owner_email || '—'}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>الاشتراك</p>
                  <p style={{ color: tenant?.expires_at && new Date(tenant.expires_at) < new Date() ? 'var(--color-status-danger)' : 'var(--color-ink-main)' }}>
                    {relDate(tenant?.expires_at)}
                  </p>
                </div>
              </div>

              {/* ── Delete Pharmacy ── */}
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="w-full rounded-xl py-2 text-xs font-bold"
                style={{ background: 'transparent', color: 'var(--color-status-danger)', border: '1px solid var(--color-status-danger)' }}
              >
                {deleting ? '...' : '🗑️ حذف الصيدلية نهائياً'}
              </button>

              {/* Suspend toggle */}
              <button
                onClick={handleToggleSuspend}
                disabled={togglingSuspend}
                className="w-full rounded-xl py-2.5 text-sm font-bold"
                style={{
                  background: isSuspended ? 'var(--color-primary-600)' : 'var(--color-status-danger-bg, #fee2e2)',
                  color: isSuspended ? 'white' : 'var(--color-status-danger)',
                }}
              >
                {togglingSuspend ? '...' : isSuspended ? '✅ إعادة تفعيل الصيدلية' : '🚫 تعليق الصيدلية'}
              </button>

              {/* Subscription Card */}
              <div className="rounded-xl p-4 mt-2" style={{ background: 'var(--color-ivory-muted)', border: '1px solid var(--color-ivory-border)' }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-sm" style={{ color: 'var(--color-ink-main)' }}>📅 الاشتراك</p>
                  <span
                    className="text-xs rounded-full px-2 py-0.5 font-bold"
                    style={{
                      background: tenant?.expires_at && new Date(tenant.expires_at) < new Date() ? '#FEF2F2' : '#F0FDF4',
                      color: tenant?.expires_at && new Date(tenant.expires_at) < new Date() ? '#DC2626' : '#059669',
                    }}
                  >
                    {tenant?.expires_at && new Date(tenant.expires_at) < new Date() ? 'منتهي' : tenant?.expires_at ? relDate(tenant.expires_at) : 'غير محدد'}
                  </span>
                </div>

                {/* Quick Renew Buttons */}
                {!showRenew ? (
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { days: 30, label: '+شهر' },
                      { days: 90, label: '+3ش' },
                      { days: 180, label: '+6ش' },
                      { days: 365, label: '+سنة' },
                    ].map((opt) => (
                      <button
                        key={opt.days}
                        onClick={() => handleRenew(opt.days)}
                        disabled={renewing}
                        className="rounded-lg py-2 text-xs font-bold"
                        style={{ background: 'var(--color-primary-600)', color: 'white' }}
                      >
                        {renewing && activeRenewDays === String(opt.days) ? '...' : opt.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={renewDays}
                      onChange={(e) => setRenewDays(e.target.value)}
                      placeholder="عدد الأيام"
                      className="flex-1 rounded-xl border px-3 py-2 text-sm"
                      style={{ borderColor: 'var(--color-ivory-border)', background: 'white' }}
                    />
                    <button
                      onClick={() => handleRenew()}
                      disabled={renewing}
                      className="rounded-xl px-4 py-2 text-sm font-bold text-white"
                      style={{ background: 'var(--color-primary-600)' }}
                    >
                      {renewing ? '...' : 'تجديد'}
                    </button>
                    <button
                      onClick={() => setShowRenew(false)}
                      className="rounded-xl px-3 py-2 text-sm"
                      style={{ background: 'var(--color-surface-secondary)', color: 'var(--color-ink-muted)' }}
                    >
                      إلغاء
                    </button>
                  </div>
                )}
                {renewMsg && <p className="text-xs mt-2 text-center">{renewMsg}</p>}
              </div>

              {/* Manual expiry date */}
              <details className="mt-2">
                <summary className="text-xs cursor-pointer" style={{ color: 'var(--color-ink-muted)' }}>تعديل يدوي لتاريخ الانتهاء</summary>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="date"
                    value={expiryInput}
                    onChange={(e) => setExpiryInput(e.target.value)}
                    className="flex-1 rounded-xl border px-3 py-2 text-sm"
                    style={{ borderColor: 'var(--color-ivory-border)', color: 'var(--color-ink-main)', background: 'var(--color-ivory-50)' }}
                  />
                  <button
                    onClick={handleSaveExpiry}
                    disabled={savingExpiry || !expiryInput}
                    className="rounded-xl px-4 py-2 text-sm font-bold text-white"
                    style={{ background: 'var(--color-primary-600)', opacity: savingExpiry || !expiryInput ? 0.5 : 1 }}
                  >
                    {savingExpiry ? '...' : 'حفظ'}
                  </button>
                </div>
              </details>
            </div>

            {/* ── Create Owner Account ── */}
            {!hasOwner && (
              <div className="app-card p-5 flex flex-col gap-3">
                <p className="font-semibold" style={{ color: 'var(--color-ink-main)' }}>👤 إنشاء حساب مالك</p>
                <input
                  type="email" placeholder="البريد الإلكتروني" value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  className="rounded-xl border px-3 py-2.5 text-sm w-full"
                  style={{ borderColor: 'var(--color-ivory-border)', color: 'var(--color-ink-main)', background: 'var(--color-ivory-50)' }}
                />
                <input
                  type="password" placeholder="كلمة المرور (6 أحرف على الأقل)" value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  className="rounded-xl border px-3 py-2.5 text-sm w-full"
                  style={{ borderColor: 'var(--color-ivory-border)', color: 'var(--color-ink-main)', background: 'var(--color-ivory-50)' }}
                />
                <button
                  onClick={handleCreateOwner}
                  disabled={creatingOwner || !ownerEmail || ownerPassword.length < 6}
                  className="rounded-xl py-2.5 text-sm font-bold text-white"
                  style={{ background: 'var(--color-primary-600)', opacity: creatingOwner || !ownerEmail || ownerPassword.length < 6 ? 0.5 : 1 }}
                >
                  {creatingOwner ? '...' : 'إنشاء الحساب'}
                </button>
                {ownerMsg && <p className="text-sm text-center">{ownerMsg}</p>}
              </div>
            )}

            {/* ── Dashboard Snapshot ── */}
            {detail.dashboard && (
              <div className="app-card p-5">
                <p className="mb-3 font-semibold" style={{ color: 'var(--color-ink-main)' }}>📊 آخر لقطة بيانات</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'مبيعات اليوم', value: `${fmt(detail.dashboard.today_sales_total)} SDG` },
                    { label: 'فواتير الشهر', value: `${detail.dashboard.month_sales_count}` },
                    { label: 'المنتجات', value: `${detail.dashboard.products_count}` },
                    { label: 'نفد المخزون', value: `${detail.dashboard.out_of_stock_count}` },
                    { label: 'الذمم (مدينون)', value: `${fmt(detail.dashboard.total_receivables)} SDG` },
                    { label: 'المصروفات', value: `${fmt(detail.dashboard.month_expenses_total)} SDG` },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl p-3" style={{ background: 'var(--color-surface-secondary)' }}>
                      <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>{item.label}</p>
                      <p className="mt-1 font-bold tabular-nums" style={{ color: 'var(--color-ink-main)' }}>{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Send Announcement ── */}
            <div className="app-card p-5 flex flex-col gap-3">
              <p className="font-semibold" style={{ color: 'var(--color-ink-main)' }}>📢 إرسال إشعار للصيدلية</p>
              <textarea
                rows={3} placeholder="نص الإشعار..." value={annMessage}
                onChange={(e) => setAnnMessage(e.target.value)}
                className="rounded-xl border px-3 py-2.5 text-sm w-full resize-none"
                style={{ borderColor: 'var(--color-ivory-border)', color: 'var(--color-ink-main)', background: 'var(--color-ivory-50)' }}
              />
              <div className="flex items-center gap-2">
                {(['info', 'warning', 'danger'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setAnnType(t)}
                    className="flex-1 rounded-lg py-1.5 text-xs font-bold"
                    style={{
                      background: annType === t ? (t === 'info' ? 'var(--color-primary-600)' : t === 'warning' ? '#f59e0b' : 'var(--color-status-danger)') : 'var(--color-surface-secondary)',
                      color: annType === t ? 'white' : 'var(--color-ink-muted)',
                    }}
                  >
                    {t === 'info' ? 'معلومة' : t === 'warning' ? 'تحذير' : 'خطر'}
                  </button>
                ))}
                <button
                  onClick={handleSendAnnouncement}
                  disabled={sendingAnn || !annMessage.trim()}
                  className="rounded-xl px-4 py-1.5 text-xs font-bold text-white"
                  style={{ background: 'var(--color-primary-600)', opacity: sendingAnn || !annMessage.trim() ? 0.5 : 1 }}
                >
                  {sendingAnn ? '...' : 'إرسال'}
                </button>
              </div>
              {annMsg && <p className="text-sm text-center">{annMsg}</p>}
            </div>

            {/* ── New Generated Token ── */}
            {false && newToken && (
              <div className="app-card p-5" style={{ border: '2px solid var(--color-primary-500)' }}>
                <p className="font-bold" style={{ color: 'var(--color-primary-700)' }}>✅ رمز جديد</p>
                <div className="mt-3 flex items-center gap-2 rounded-xl p-3" style={{ background: 'var(--color-surface-secondary)' }}>
                  <code className="flex-1 break-all text-xs" dir="ltr">{newToken}</code>
                  <button
                    onClick={() => handleCopy(newToken)}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                    style={{ background: copied ? 'var(--color-status-success)' : 'var(--color-primary-600)' }}
                  >
                    {copied ? '✓ تم' : 'نسخ'}
                  </button>
                </div>
                <button onClick={() => setNewToken('')} className="mt-2 text-xs" style={{ color: 'var(--color-ink-muted)' }}>إغلاق</button>
              </div>
            )}

            {/* ── Tokens ── */}
            <div className="app-panel overflow-hidden hidden">
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--color-ivory-border)' }}>
                <p className="font-semibold" style={{ color: 'var(--color-ink-main)' }}>🔑 الرموز</p>
                <button
                  onClick={handleGenerate}
                  className="rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                  style={{ background: 'var(--color-primary-600)' }}
                >
                  + رمز جديد
                </button>
              </div>
              {([] as typeof detail.tokens).map((t, i) => (
                <div
                  key={t.token}
                  className="flex flex-col gap-1.5 px-4 py-3"
                  style={{ borderBottom: i < detail.tokens.length - 1 ? '1px solid var(--color-ivory-border)' : 'none' }}
                >
                  <div className="flex items-center gap-2">
                    <code className="flex-1 break-all text-xs" dir="ltr" style={{ color: 'var(--color-ink-main)', wordBreak: 'break-all' }}>{t.token}</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(t.token);
                        setCopiedToken(t.token);
                        setTimeout(() => setCopiedToken(null), 2000);
                      }}
                      className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold"
                      style={{ background: copiedToken === t.token ? 'var(--color-status-success-bg)' : 'var(--color-surface-secondary)', color: copiedToken === t.token ? 'var(--color-status-success)' : 'var(--color-ink-muted)' }}
                    >
                      {copiedToken === t.token ? '✓ تم' : 'نسخ'}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>{t.label}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{ background: t.is_active ? 'var(--color-status-success-bg)' : 'var(--color-surface-secondary)', color: t.is_active ? 'var(--color-status-success)' : 'var(--color-ink-muted)' }}
                    >
                      {t.is_active ? 'نشط' : 'ملغي'}
                    </span>
                    {t.is_active && (
                      <button
                        onClick={() => handleRevoke(t.token)}
                        disabled={revoking === t.token}
                        className="text-xs"
                        style={{ color: 'var(--color-status-danger)' }}
                      >
                        {revoking === t.token ? '...' : 'إلغاء'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* ── License Keys ── */}
            <div className="app-panel overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--color-ivory-border)' }}>
                <p className="font-semibold" style={{ color: 'var(--color-ink-main)' }}>🔑 مفاتيح الترخيص <span className="text-xs font-normal ms-1" style={{ color: 'var(--color-ink-muted)' }}>PMS-XXXX-XXXX-XXXX</span></p>
                <div className="flex gap-1">
                  {[{ days: 365, label: 'سنة' }, { days: 180, label: '6ش' }, { days: 30, label: 'شهر' }].map((opt) => (
                    <button
                      key={opt.days}
                      onClick={() => handleGenerateLicense(opt.days)}
                      disabled={generatingLicense}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-white"
                      style={{ background: 'var(--color-primary-600)', opacity: generatingLicense ? 0.5 : 1 }}
                    >
                      {generatingLicense ? '...' : `+ ${opt.label}`}
                    </button>
                  ))}
                </div>
              </div>
              {licenseKeys.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm" style={{ color: 'var(--color-ink-muted)' }}>لا توجد مفاتيح — أنشئ مفتاحاً جديداً أعلاه</p>
              ) : licenseKeys.map((lk, i) => (
                <div
                  key={lk.key}
                  className="flex flex-col gap-1.5 px-4 py-3"
                  style={{ borderBottom: i < licenseKeys.length - 1 ? '1px solid var(--color-ivory-border)' : 'none' }}
                >
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm font-mono font-bold" dir="ltr" style={{ color: 'var(--color-primary-700)', letterSpacing: '0.05em' }}>{lk.key}</code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(lk.key); setCopiedLicKey(lk.key); setTimeout(() => setCopiedLicKey(null), 2000); }}
                      className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold"
                      style={{ background: copiedLicKey === lk.key ? 'var(--color-status-success-bg)' : 'var(--color-surface-secondary)', color: copiedLicKey === lk.key ? 'var(--color-status-success)' : 'var(--color-ink-muted)' }}
                    >
                      {copiedLicKey === lk.key ? '✓ تم' : 'نسخ'}
                    </button>
                    <button
                      onClick={() => handleDeleteLicKey(lk.key)}
                      disabled={deletingLicKey === lk.key}
                      className="shrink-0 text-xs rounded-lg px-2 py-1"
                      style={{ color: 'var(--color-status-danger)', background: 'var(--color-status-danger-bg, #fee2e2)' }}
                    >
                      {deletingLicKey === lk.key ? '...' : 'حذف'}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-bold"
                      style={{
                        background: lk.status === 'pending' ? '#F0FDF4' : lk.status === 'used' ? '#DBEAFE' : '#F3F4F6',
                        color: lk.status === 'pending' ? '#059669' : lk.status === 'used' ? '#2563EB' : '#6B7280',
                      }}
                    >
                      {lk.status === 'pending' ? 'قيد الانتظار' : lk.status === 'used' ? 'مستخدم' : lk.status}
                    </span>
                    {lk.expires_at && (
                      <span className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>ينتهي: {new Date(lk.expires_at).toLocaleDateString('ar')}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* ── Recent Events ── */}
            {detail.recent_events.length > 0 && (
              <div className="app-panel overflow-hidden">
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-ivory-border)' }}>
                  <p className="font-semibold" style={{ color: 'var(--color-ink-main)' }}>📋 آخر الأحداث</p>
                </div>
                {detail.recent_events.slice(0, 10).map((ev, i) => (
                  <div
                    key={`${ev.entity_id}-${ev.occurred_at}-${i}`}
                    className="flex items-start gap-3 px-4 py-3"
                    style={{ borderBottom: i < Math.min(detail.recent_events.length, 10) - 1 ? '1px solid var(--color-ivory-border)' : 'none' }}
                  >
                    <span>{EVENT_EMOJI[ev.event_type] || '📌'}</span>
                    <p className="flex-1 text-sm" style={{ color: 'var(--color-ink-main)' }}>{ev.summary || ev.event_type}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
