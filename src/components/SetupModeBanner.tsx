import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, CheckCircle2, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import * as api from '../api';

export default function SetupModeBanner() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [setupMode, setSetupMode] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await api.getSetupMode();
      setSetupMode(s.setup_mode);
    } catch {
      setSetupMode(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  if (!setupMode) return null;

  const isOwnerOrManager = role?.name === 'owner' || role?.name === 'manager';

  const handleFinalize = async () => {
    if (!user?.id) return;
    setWorking(true);
    try {
      await api.finalizeSetupMode(user.id);
      setSetupMode(false);
      setConfirming(false);
    } catch (err) {
      alert(typeof err === 'string' ? err : 'فشل إنهاء وضع الإعداد');
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 bg-amber-50 border-b border-amber-200 px-5 py-2.5 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <SettingsIcon size={16} className="text-amber-700 shrink-0" />
          <span className="text-amber-900 font-medium truncate">
            وضع الإعداد نشط — يمكنك إدخال الكميات الافتتاحية لمنتجاتك الموجودة بدون فاتورة شراء.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate('/warehouse/opening-stock')}
            className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
          >
            إدخال الكميات
          </button>
          {isOwnerOrManager && (
            <button
              onClick={() => setConfirming(true)}
              className="rounded-xl bg-white border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 transition-colors"
            >
              إنهاء الإعداد
            </button>
          )}
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !working && setConfirming(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={20} className="text-amber-600" />
                <h3 className="text-lg font-bold text-ink-main">إنهاء وضع الإعداد</h3>
              </div>
              <button onClick={() => !working && setConfirming(false)} className="text-ink-muted hover:text-ink-main">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-ink-muted leading-relaxed">
              بعد الإنهاء لن تتمكن من إضافة كميات افتتاحية. أي مخزون جديد يجب أن يُسجّل عبر فاتورة شراء حقيقية.
            </p>
            <p className="text-sm text-ink-muted leading-relaxed mt-2">
              تأكد من إدخال جميع منتجاتك وكمياتها الحالية قبل المتابعة.
            </p>
            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => setConfirming(false)}
                disabled={working}
                className="rounded-xl px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-secondary"
              >
                إلغاء
              </button>
              <button
                onClick={handleFinalize}
                disabled={working}
                className="rounded-xl bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {working ? 'جاري الإنهاء...' : 'تأكيد الإنهاء'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
