import { useState, useEffect } from 'react';
import { getSyncConfig, saveSyncConfig, getCloudSyncStatus, syncAllTablesNow } from '../../api';
import type { CloudSyncStatus } from '../../types';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';

const inp = 'w-full rounded-xl border border-ivory-border bg-surface-secondary px-4 py-2.5 text-sm text-ink-main outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20';

export default function CloudSyncTab() {
  const [endpoint, setEndpoint] = useState('');
  const [token, setToken] = useState('');
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);

  useEffect(() => {
    Promise.all([getSyncConfig(), getCloudSyncStatus()])
      .then(([config, status]) => {
        setEndpoint(config.endpoint);
        setToken(config.token);
        setSyncStatus(status);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleTest = async () => {
    if (!endpoint.trim()) return;
    setTesting(true);
    setTestResult('idle');
    try {
      const res = await fetch(`${endpoint.trim()}/health`);
      setTestResult(res.ok ? 'ok' : 'fail');
    } catch {
      setTestResult('fail');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSyncConfig({ endpoint: endpoint.trim(), token: token.trim() });
      setToast({ type: 'success', msg: 'تم حفظ إعدادات المزامنة بنجاح' });
    } catch (err) {
      setToast({ type: 'danger', msg: String(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const results = await syncAllTablesNow();
      const total = results.reduce((s, r) => s + r.upserted, 0);
      setSyncResult(`✅ تمت المزامنة — ${total} سجل`);
      const updated = await getCloudSyncStatus();
      setSyncStatus(updated);
    } catch (err) {
      setSyncResult(`❌ ${String(err)}`);
    } finally {
      setSyncing(false);
    }
  };

  function relativeTime(iso: string | null): string {
    if (!iso) return 'لم تتم مزامنة بعد';
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60)    return 'منذ لحظات';
    if (diff < 3600)  return `منذ ${Math.floor(diff / 60)} دقيقة`;
    if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
    return `منذ ${Math.floor(diff / 86400)} يوم`;
  }

  function syncHealth(status: CloudSyncStatus | null): { color: string; bg: string; label: string; icon: string } {
    if (!status || (!status.last_synced_at && !status.last_attempt_at)) {
      return { color: 'text-ink-placeholder', bg: 'bg-surface-secondary', label: 'غير مهيأ', icon: '●' };
    }
    const last = status.last_synced_at || status.last_attempt_at || '';
    const diff = Math.floor((Date.now() - new Date(last).getTime()) / 1000);
    if (diff < 3600)       return { color: 'text-status-success', bg: 'bg-green-50', label: 'ممتاز — نشط', icon: '●' };
    if (diff < 86400)      return { color: 'text-amber-600', bg: 'bg-amber-50', label: 'تحذير — آخر مزامنة قديمة', icon: '●' };
    if (status.last_error) return { color: 'text-status-danger', bg: 'bg-red-50', label: 'خطأ — فشل آخر مزامنة', icon: '●' };
    return { color: 'text-status-danger', bg: 'bg-red-50', label: 'منقطع — المزامنة متوقفة', icon: '●' };
  }

  if (loading) {
    return <div className="app-card py-12 text-center text-ink-muted">جاري التحميل...</div>;
  }

  return (
    <div className="flex max-w-lg flex-col gap-5">
      <div className="app-card p-5">
        <h3 className="mb-4 text-base font-bold text-ink-main">إعدادات المزامنة السحابية</h3>

        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="sync-endpoint" className="mb-1.5 block text-sm font-medium text-ink-main">
              رابط الخادم
            </label>
            <input
              id="sync-endpoint"
              className={inp}
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://taj.systems"
              dir="ltr"
            />
          </div>

          <div>
            <label htmlFor="sync-token" className="mb-1.5 block text-sm font-medium text-ink-main">
              رمز التزامن
            </label>
            <div className="relative">
              <input
                id="sync-token"
                className={`${inp} pe-11`}
                type={visible ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                className="absolute inset-y-0 end-0 flex items-center pe-3 text-ink-muted"
                tabIndex={-1}
              >
                {visible ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>

          {testResult !== 'idle' && (
            <div className={`rounded-xl px-4 py-2.5 text-sm ${testResult === 'ok' ? 'bg-green-50 text-status-success' : 'bg-red-50 text-status-danger'}`}>
              {testResult === 'ok' ? '✅ الخادم متاح ويستجيب بشكل صحيح' : '❌ تعذر الاتصال بالخادم، تحقق من الرابط'}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={handleTest} disabled={testing || !endpoint.trim()}>
              {testing ? 'جاري الاختبار...' : 'اختبار الاتصال'}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
          </div>
        </div>
      </div>

      {/* Sync Now */}
      <div className="app-card p-5">
        <h3 className="mb-1 text-base font-bold text-ink-main">مزامنة فورية</h3>
        <p className="mb-4 text-xs text-ink-muted">ارفع جميع البيانات (مبيعات، منتجات، عملاء...) إلى السحابة الآن</p>
        <Button onClick={handleSyncNow} disabled={syncing}>
          {syncing ? '⏳ جاري المزامنة...' : '☁️ مزامنة الآن'}
        </Button>
        {syncResult && (
          <p className={`mt-3 text-sm ${syncResult.startsWith('✅') ? 'text-status-success' : 'text-status-danger'}`}>
            {syncResult}
          </p>
        )}
      </div>

      {syncStatus && (
        <div className="app-panel p-4">
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full ${syncHealth(syncStatus).color}`} />
            <span className={`text-sm font-semibold ${syncHealth(syncStatus).color}`}>
              {syncHealth(syncStatus).label}
            </span>
          </div>
          <div className={`mt-2 rounded-xl px-4 py-3 text-sm ${syncHealth(syncStatus).bg}`}>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">آخر مزامنة:</span>
              <span className="font-medium text-ink-main">
                {relativeTime(syncStatus.last_synced_at ?? null)}
              </span>
            </div>
            {syncStatus.last_auto_run_at && (
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-ink-muted">آخر مزامنة تلقائية:</span>
                <span className="text-ink-main">{relativeTime(syncStatus.last_auto_run_at)}</span>
              </div>
            )}
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-ink-muted">آخر دورة:</span>
              <span className="text-ink-main">
                {syncStatus.last_run_synced} منجح · {syncStatus.last_run_failed} فشل
              </span>
            </div>
            {syncStatus.pending_count > 0 && (
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-amber-600">معلق:</span>
                <span className="font-medium text-amber-700">{syncStatus.pending_count} سجل</span>
              </div>
            )}
            {syncStatus.last_error && (
              <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-status-danger">
                آخر خطأ: {syncStatus.last_error}
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            🔄 المزامنة تتم تلقائياً كل 5 دقائق — لا حاجة لأي إجراء يدوي
          </p>
        </div>
      )}

      <div className="rounded-xl border border-ivory-border bg-surface-secondary p-4 text-xs text-ink-muted">
        <strong>دليل الإعداد للصيدليات الجديدة:</strong><br/>
        ١. احصل على رابط الخادم والرمز من مزود البرنامج<br/>
        ٢. أدخلهما هنا واضغط "حفظ"<br/>
        ٣. البيانات ستتزامن تلقائياً كل 5 دقائق
      </div>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
