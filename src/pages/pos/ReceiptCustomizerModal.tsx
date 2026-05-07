import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../../components/ui/Button';
import type { ReceiptPreferences } from './workspaceState';

interface ReceiptCustomizerModalProps {
  header: string;
  footer: string;
  printLogo: boolean;
  preferences: ReceiptPreferences;
  saving: boolean;
  onClose: () => void;
  onSave: (next: {
    header: string;
    footer: string;
    printLogo: boolean;
    preferences: ReceiptPreferences;
  }) => void;
}

export default function ReceiptCustomizerModal({
  header,
  footer,
  printLogo,
  preferences,
  saving,
  onClose,
  onSave,
}: ReceiptCustomizerModalProps) {
  const { t } = useTranslation();
  const [draftHeader, setDraftHeader] = useState(header);
  const [draftFooter, setDraftFooter] = useState(footer);
  const [draftLogo, setDraftLogo] = useState(printLogo);
  const [draftPreferences, setDraftPreferences] = useState<ReceiptPreferences>(preferences);

  const toggle = (key: keyof ReceiptPreferences) => {
    setDraftPreferences((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center">
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
            <label className="flex items-center justify-between rounded-2xl border border-ivory-border bg-ivory-app px-3 py-3 text-sm text-ink-main md:col-span-2">
              <span>{t('settings.general.printLogo')}</span>
              <input
                type="checkbox"
                checked={draftLogo}
                onChange={(event) => setDraftLogo(event.target.checked)}
                className="h-4 w-4 accent-primary-600"
              />
            </label>
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
                preferences: draftPreferences,
              })}
              disabled={saving}
            >
              {saving ? t('common.loading') : t('settings.save')}
            </Button>
          </div>
        </div>

        <div className="rounded-[26px] bg-slate-950 p-4 text-white shadow-[var(--shadow-card)]">
          <div className="mb-3 text-xs uppercase tracking-[0.25em] text-white/45">{t('pos.receiptPreview')}</div>
          <div className="rounded-[22px] bg-white p-4 text-slate-900">
            <div className="text-center">
              {draftLogo && <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-primary-700">{t('pos.receiptLogo')}</div>}
              <div className="text-sm font-bold">{t('pos.receiptPharmacyName')}</div>
              {draftHeader && <div className="mt-2 whitespace-pre-line text-[11px] text-slate-500">{draftHeader}</div>}
            </div>
            <div className="my-3 border-t border-dashed border-slate-300" />
            <div className="space-y-2 text-[11px]">
              {draftPreferences.showCashier && <div>{t('pos.cashier')}: {t('pos.receiptSampleCashier')}</div>}
              {draftPreferences.showCustomer && <div>{t('pos.customer')}: {t('pos.receiptSampleCustomer')}</div>}
              {draftPreferences.showNotes && <div>{t('pos.notes')}: {t('pos.receiptSampleNote')}</div>}
              {draftPreferences.showPaymentBreakdown && <div>{t('pos.receiptSamplePayments')}</div>}
            </div>
            <div className="my-3 border-t border-dashed border-slate-300" />
            <div className={`space-y-1 ${draftPreferences.compactMode ? 'text-[10px]' : 'text-[11px]'}`}>
              <div className="flex justify-between"><span>{t('pos.product')}</span><span>{t('pos.qty')}</span></div>
              <div className="flex justify-between text-slate-500"><span>{t('pos.receiptSampleItem')}</span><span>2</span></div>
              <div className="flex justify-between font-semibold"><span>{t('pos.grandTotal')}</span><span>12,500.00</span></div>
            </div>
            <div className="my-3 border-t border-dashed border-slate-300" />
            <div className="whitespace-pre-line text-center text-[10px] text-slate-500">{draftFooter || t('pos.receiptFooter')}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
