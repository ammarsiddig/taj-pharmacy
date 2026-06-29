import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import * as api from '../../api';
import type { TenantSettingsUpdate } from '../../types';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';

export default function GeneralTab() {
  const { t } = useTranslation();
  const [lang, setLang] = useState<'ar' | 'en'>(() => (localStorage.getItem('app_lang') as 'ar' | 'en') || 'ar');

  function switchLang(next: 'ar' | 'en') {
    setLang(next);
    i18n.changeLanguage(next);
    localStorage.setItem('app_lang', next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';
  }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const [form, setForm] = useState<TenantSettingsUpdate>({
    name: '', name_ar: '', license_number: '', phone: '', address: '',
    currency_code: 'SDG', timezone: 'Africa/Khartoum',
    receipt_header: '', receipt_footer: '', print_logo: true,
  });
  useEffect(() => {
    (async () => {
      try {
        const s = await api.getTenantSettings();
        setForm({
          name: s.name, name_ar: s.name_ar || '', license_number: s.license_number || '',
          phone: s.phone || '', address: s.address || '',
          currency_code: s.currency_code, timezone: s.timezone,
          receipt_header: s.receipt_header || '', receipt_footer: s.receipt_footer || '',
          print_logo: s.print_logo,
        });
      } catch (e: unknown) { setToast({ msg: String(e), type: 'danger' }); }
      finally { setLoading(false); }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateTenantSettings(form);
      setToast({ msg: t('settings.general.saveSuccess'), type: 'success' });
    } catch (e: unknown) { setToast({ msg: String(e), type: 'danger' }); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="py-12 text-center text-ink-muted">{t('common.loading')}</div>;

  const inp = "app-input w-full px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100";

  return (
    <div className="app-card max-w-3xl space-y-4 p-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <h3 className="text-base font-bold text-ink-main">{t('settings.general.title')}</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">{t('settings.general.pharmacyName')}</label>
          <input className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">{t('settings.general.pharmacyNameAr')}</label>
          <input className={inp} value={form.name_ar || ''} onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))} dir="rtl" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">{t('settings.general.licenseNumber')}</label>
          <input className={inp} value={form.license_number || ''} onChange={e => setForm(f => ({ ...f, license_number: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">{t('settings.general.phone')}</label>
          <input className={inp} value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-ink-muted mb-1">{t('settings.general.address')}</label>
          <input className={inp} value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">{t('settings.general.currency')}</label>
          <input className={inp} value={form.currency_code || 'SDG'} onChange={e => setForm(f => ({ ...f, currency_code: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">{t('settings.general.timezone')}</label>
          <input className={inp} value={form.timezone || ''} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-ink-muted mb-1">{t('settings.general.receiptHeader')}</label>
          <textarea className={inp + ' h-16 resize-none'} value={form.receipt_header || ''} onChange={e => setForm(f => ({ ...f, receipt_header: e.target.value }))} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-ink-muted mb-1">{t('settings.general.receiptFooter')}</label>
          <textarea className={inp + ' h-16 resize-none'} value={form.receipt_footer || ''} onChange={e => setForm(f => ({ ...f, receipt_footer: e.target.value }))} />
        </div>
        <div className="col-span-2 rounded-xl border border-dashed border-ivory-border bg-ivory-muted/60 px-3 py-2.5">
          <p className="text-xs text-ink-muted">{t('settings.general.logoMovedHint')}</p>
        </div>
      </div>
      {/* Language Toggle */}
      <div className="app-panel p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-ink-main">لغة الواجهة / Interface Language</p>
          <p className="text-xs text-ink-muted mt-0.5">عربي ↔ English</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-ivory-border bg-ivory-muted p-1">
          <button
            onClick={() => switchLang('ar')}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              lang === 'ar' ? 'bg-[#1C5F6F] text-white shadow-sm' : 'text-ink-muted hover:text-ink-main'
            }`}
          >
            العربية
          </button>
          <button
            onClick={() => switchLang('en')}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              lang === 'en' ? 'bg-[#1C5F6F] text-white shadow-sm' : 'text-ink-muted hover:text-ink-main'
            }`}
          >
            English
          </button>
        </div>
      </div>
      <Button onClick={handleSave} disabled={saving}>{saving ? t('common.loading') : t('settings.save')}</Button>
    </div>
  );
}
