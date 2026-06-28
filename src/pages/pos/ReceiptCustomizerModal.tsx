import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';
import ReceiptBody, { type LogoPosition, type LogoSize } from '../../components/ui/ReceiptBody';
import * as api from '../../api';
import type { TenantSettings } from '../../types';
import type { ReceiptPreferences } from './workspaceState';

interface ReceiptCustomizerModalProps {
  header: string;
  footer: string;
  printLogo: boolean;
  logoPosition: LogoPosition;
  logoSize: LogoSize;
  preferences: ReceiptPreferences;
  saving: boolean;
  onClose: () => void;
  onSave: (next: {
    header: string;
    footer: string;
    printLogo: boolean;
    logoPosition: LogoPosition;
    logoSize: LogoSize;
    preferences: ReceiptPreferences;
  }) => void;
}

// Position picker: the first three set logo_position; "none" sets print_logo=false.
type PositionChoice = LogoPosition | 'none';

export default function ReceiptCustomizerModal({
  header,
  footer,
  printLogo,
  logoPosition,
  logoSize,
  preferences,
  saving,
  onClose,
  onSave,
}: ReceiptCustomizerModalProps) {
  const { t } = useTranslation();
  const [draftHeader, setDraftHeader] = useState(header);
  const [draftFooter, setDraftFooter] = useState(footer);
  const [draftLogo, setDraftLogo] = useState(printLogo);
  const [draftPosition, setDraftPosition] = useState<LogoPosition>(logoPosition);
  const [draftSize, setDraftSize] = useState<LogoSize>(logoSize);
  const [draftPreferences, setDraftPreferences] = useState<ReceiptPreferences>(preferences);

  // Live pharmacy identity + logo so the preview matches a real print.
  const [tenant, setTenant] = useState<TenantSettings | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getTenantSettings().then(setTenant).catch(() => { /* preview falls back to default name */ });
    api.getPharmacyLogo().then(setLogoUrl).catch(() => { /* preview shows no logo */ });
  }, []);

  const toggle = (key: keyof ReceiptPreferences) => {
    setDraftPreferences((current) => ({ ...current, [key]: !current[key] }));
  };

  const positionChoice: PositionChoice = draftLogo ? draftPosition : 'none';
  const selectPosition = (choice: PositionChoice) => {
    if (choice === 'none') {
      setDraftLogo(false);
    } else {
      setDraftLogo(true);
      setDraftPosition(choice);
    }
  };

  const handleLogoFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 500_000) {
      setToast({ msg: t('pos.receiptLogoTooLarge'), type: 'danger' });
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const b64 = dataUrl.split(',')[1];
      try {
        await api.savePharmacyLogo(b64);
        setLogoUrl(dataUrl);
        setDraftLogo(true);
        setToast({ msg: t('settings.general.logoSaved'), type: 'success' });
      } catch (err: unknown) {
        setToast({ msg: String(err), type: 'danger' });
      }
    };
    reader.readAsDataURL(file);
  };

  const positionOptions: Array<[PositionChoice, string]> = [
    ['center', t('pos.receiptLogoCenter')],
    ['right', t('pos.receiptLogoRight')],
    ['left', t('pos.receiptLogoLeft')],
    ['none', t('pos.receiptLogoNone')],
  ];
  const sizeOptions: Array<[LogoSize, string]> = [
    ['small', t('pos.receiptLogoSmall')],
    ['medium', t('pos.receiptLogoMedium')],
    ['large', t('pos.receiptLogoLarge')],
  ];

  // Sample sale so toggles + logo changes visibly affect the faithful preview.
  const sampleItems = [
    { id: 's1', product_name: t('pos.receiptSampleItem'), quantity: 2, unit_price: 625000, subtotal: 1250000 },
  ];

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="relative mx-4 grid w-full max-w-5xl gap-4 rounded-[28px] bg-ivory-app p-5 shadow-[var(--shadow-float)] lg:grid-cols-[minmax(0,1.15fr)_320px]">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold text-ink-main">{t('pos.receiptCustomizerTitle')}</h3>
            <p className="text-sm text-ink-muted">{t('pos.receiptCustomizerHint')}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-ink-muted">{t('settings.general.receiptHeader')}</span>
              <textarea
                value={draftHeader}
                onChange={(event) => setDraftHeader(event.target.value)}
                className="app-input h-28 w-full resize-none px-3 py-2 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-ink-muted">{t('settings.general.receiptFooter')}</span>
              <textarea
                value={draftFooter}
                onChange={(event) => setDraftFooter(event.target.value)}
                className="app-input h-28 w-full resize-none px-3 py-2 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              />
            </label>
          </div>

          <div className="grid gap-3 rounded-3xl bg-white p-4 shadow-[var(--shadow-card)] md:grid-cols-2">
            {([
              ['showCustomer', t('pos.receiptShowCustomer')],
              ['showCashier', t('pos.receiptShowCashier')],
              ['showNotes', t('pos.receiptShowNotes')],
              ['showPaymentBreakdown', t('pos.receiptShowPayments')],
              ['compactMode', t('pos.receiptCompactMode')],
            ] as Array<[keyof ReceiptPreferences, string]>).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => toggle(key)}
                className={`flex items-center justify-between rounded-2xl border px-3 py-3 text-sm transition-colors ${draftPreferences[key] ? 'border-primary-500 bg-primary-50 text-primary-800' : 'border-ivory-border bg-ivory-app text-ink-main hover:bg-ivory-muted'}`}
              >
                <span>{label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${draftPreferences[key] ? 'bg-primary-600 text-white' : 'bg-white text-ink-muted'}`}>
                  {draftPreferences[key] ? t('common.yes') : t('common.no')}
                </span>
              </button>
            ))}
          </div>

          {/* Logo section — single source of truth for upload + position + size */}
          <div className="space-y-3 rounded-3xl bg-white p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-ink-main">{t('pos.receiptLogoSection')}</span>
              <div className="flex items-center gap-3">
                {logoUrl && (
                  <img src={logoUrl} alt={t('common.logo')} className="h-10 w-10 rounded-lg border border-ivory-border object-contain bg-white" />
                )}
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="rounded-xl bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
                >
                  {logoUrl ? t('pos.receiptChangeLogo') : t('pos.receiptUploadLogo')}
                </button>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    handleLogoFile(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
              </div>
            </div>
            <p className="text-[10px] text-ink-muted">{t('pos.receiptLogoHint')}</p>

            <div className="space-y-1">
              <span className="text-xs font-medium text-ink-muted">{t('pos.receiptLogoPosition')}</span>
              <div className="flex flex-wrap gap-2">
                {positionOptions.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => selectPosition(value)}
                    className={`rounded-2xl border px-3 py-2 text-sm transition-colors ${positionChoice === value ? 'border-primary-500 bg-primary-50 text-primary-800' : 'border-ivory-border bg-ivory-app text-ink-main hover:bg-ivory-muted'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-medium text-ink-muted">{t('pos.receiptLogoSize')}</span>
              <div className="flex flex-wrap gap-2">
                {sizeOptions.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={!draftLogo}
                    onClick={() => setDraftSize(value)}
                    className={`rounded-2xl border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${draftSize === value && draftLogo ? 'border-primary-500 bg-primary-50 text-primary-800' : 'border-ivory-border bg-ivory-app text-ink-main hover:bg-ivory-muted'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-2xl px-4 py-2 text-sm text-ink-muted hover:bg-ivory-muted">
              {t('common.cancel')}
            </button>
            <Button
              onClick={() => onSave({
                header: draftHeader,
                footer: draftFooter,
                printLogo: draftLogo,
                logoPosition: draftPosition,
                logoSize: draftSize,
                preferences: draftPreferences,
              })}
              disabled={saving}
            >
              {saving ? t('common.loading') : t('settings.save')}
            </Button>
          </div>
        </div>

        {/* Faithful 80mm thermal preview — same ReceiptBody the printer uses */}
        <div className="rounded-[26px] bg-slate-200 p-4 shadow-[var(--shadow-card)]">
          <div className="mb-3 text-xs uppercase tracking-[0.25em] text-slate-500">{t('pos.receiptPreview')}</div>
          <div className="mx-auto overflow-y-auto" style={{ maxHeight: '60vh' }}>
            <div
              className="mx-auto bg-white p-2 text-black shadow-md"
              style={{ width: '80mm', fontFamily: '"Courier New", Consolas, monospace' }}
            >
              <ReceiptBody
                saleNumber="INV-000123"
                date={new Date().toISOString()}
                items={sampleItems}
                subtotal={1250000}
                total={1250000}
                paymentMethod="cash"
                amountPaid={1250000}
                changeAmount={0}
                customerName={t('pos.receiptSampleCustomer')}
                cashierName={t('pos.receiptSampleCashier')}
                notes={t('pos.receiptSampleNote')}
                splitPayments={[
                  { id: 'p1', payment_method: 'cash', amount: 500000 },
                  { id: 'p2', payment_method: 'bank_transfer', payment_method_name: t('pos.bankTransfer'), amount: 750000 },
                ]}
                pharmacyName={tenant?.name || t('pos.receiptPharmacyName')}
                pharmacyNameAr={tenant?.name_ar || ''}
                licenseNumber={tenant?.license_number || ''}
                phone={tenant?.phone || ''}
                address={tenant?.address || ''}
                header={draftHeader}
                footer={draftFooter || t('pos.receiptFooter')}
                logoUrl={logoUrl}
                showLogo={draftLogo}
                logoPosition={draftPosition}
                logoSize={draftSize}
                preferences={draftPreferences}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
