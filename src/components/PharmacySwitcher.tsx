import { useState, useEffect } from 'react';
import { listPharmacies, switchPharmacy, getActivePharmacy } from '../api';
import type { PharmacyConfig } from '../types';

interface Props {
  onSwitch?: () => void;
}

export default function PharmacySwitcher({ onSwitch }: Props) {
  const [pharmacies, setPharmacies] = useState<PharmacyConfig[]>([]);
  const [active, setActive] = useState<PharmacyConfig | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPharmacies();
  }, []);

  const loadPharmacies = async () => {
    try {
      const [all, current] = await Promise.all([
        listPharmacies(),
        getActivePharmacy()
      ]);
      setPharmacies(all);
      setActive(current);
    } catch (err) {
      console.error('Failed to load pharmacies:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitch = async (tenantId: string) => {
    try {
      await switchPharmacy(tenantId);
      await loadPharmacies();
      setIsOpen(false);
      onSwitch?.();
      // App restart required to load new DB
      window.location.reload();
    } catch (err) {
      console.error('Failed to switch pharmacy:', err);
      alert('فشل تبديل الصيدلية: ' + err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm text-white">
        <span>جاري التحميل...</span>
      </div>
    );
  }

  // Don't show if only one or no pharmacies configured
  if (pharmacies.length <= 1) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm text-white hover:bg-primary-700 transition-colors"
        title="تبديل الصيدلية"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span className="max-w-[150px] truncate">
          {active?.name_ar || active?.name || 'اختر الصيدلية'}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-ivory-border bg-white p-2 shadow-lg">
            <div className="mb-2 border-b border-ivory-border px-3 py-2">
              <p className="text-xs font-medium text-ink-muted">الصيدليات المتاحة</p>
            </div>
            {pharmacies.map((p) => (
              <button
                key={p.tenant_id}
                onClick={() => handleSwitch(p.tenant_id)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-right text-sm transition-colors ${
                  p.is_active 
                    ? 'bg-primary-50 text-primary-700' 
                    : 'hover:bg-surface-secondary text-ink-main'
                }`}
              >
                <div className="flex flex-col items-start">
                  <span className="font-medium">{p.name_ar || p.name}</span>
                  <span className="text-xs text-ink-muted">{p.tenant_id}</span>
                </div>
                {p.is_active && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-xs text-white">
                    ✓
                  </span>
                )}
                {p.is_default && !p.is_active && (
                  <span className="text-xs text-primary-600">افتراضي</span>
                )}
              </button>
            ))}
            <div className="mt-2 border-t border-ivory-border px-3 py-2">
              <p className="text-xs text-ink-muted">
                ⚠️ سيتم إعادة تشغيل التطبيق بعد التبديل
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
