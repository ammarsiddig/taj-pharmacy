import { useTranslation } from 'react-i18next';
import * as api from '../../api';
import type { AccountRow, ConfirmPurchasePaymentData, StorageLocationFull } from '../../types';
import Button from '../ui/Button';

interface Props {
  open: boolean;
  locations: StorageLocationFull[];
  selectedLocationId: string;
  confirmPaymentInfo: ConfirmPurchasePaymentData;
  accounts: AccountRow[];
  accountTypeFor: (accountId: string) => string;
  derivedMethodLabel: (accountId: string) => string;
  onClose: () => void;
  onLocationChange: (id: string) => void;
  onPaymentInfoChange: (p: ConfirmPurchasePaymentData) => void;
  onConfirm: () => void;
}

export default function ConfirmPurchaseModal({
  open,
  locations,
  selectedLocationId,
  confirmPaymentInfo,
  accounts,
  accountTypeFor,
  derivedMethodLabel,
  onClose,
  onLocationChange,
  onPaymentInfoChange,
  onConfirm,
}: Props) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[420px] rounded-2xl bg-white p-5 shadow-[var(--shadow-float)] border border-ivory-border">
        <h3 className="mb-1 font-bold text-ink-main">{t('purchases.confirmTitle')}</h3>
        <p className="mb-4 text-sm text-ink-muted">{t('purchases.confirmMsg')}</p>
        {locations.length > 0 && (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.storageLocation')}</label>
            <select
              value={selectedLocationId}
              onChange={e => onLocationChange(e.target.value)}
              className="app-input w-full px-3 py-2 text-sm"
            >
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name_ar || l.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.confirmPaymentMode')}</label>
          <select
            value={confirmPaymentInfo.payment_mode}
            onChange={e => onPaymentInfoChange({ ...confirmPaymentInfo, payment_mode: e.target.value as 'unpaid' | 'paid' | 'partial' })}
            className="app-input w-full px-3 py-2 text-sm"
          >
            <option value="unpaid">{t('purchases.payModeUnpaid')}</option>
            <option value="paid">{t('purchases.payModePaid')}</option>
            <option value="partial">{t('purchases.payModePartial')}</option>
          </select>
        </div>
        {confirmPaymentInfo.payment_mode !== 'unpaid' && (
          <div className="space-y-3 mb-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.payAccount')}</label>
              <select
                value={confirmPaymentInfo.account_id ?? ''}
                onChange={e => {
                  const acctId = e.target.value;
                  const derived = api.paymentMethodFromAccountType(accountTypeFor(acctId));
                  onPaymentInfoChange({ ...confirmPaymentInfo, account_id: acctId, payment_method: derived });
                }}
                className="app-input w-full px-3 py-2 text-sm"
              >
                <option value="">{t('purchases.payAccount')}</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name_ar || a.name} — {api.formatMoney(a.current_balance)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.payMethod')}</label>
              <div className="px-3 py-2 text-sm rounded-lg bg-ivory-muted border border-ivory-border text-ink-muted">
                {derivedMethodLabel(confirmPaymentInfo.account_id ?? '')}
              </div>
            </div>
            {confirmPaymentInfo.payment_mode === 'partial' && (
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.partialAmount')}</label>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={confirmPaymentInfo.amount_paid !== undefined ? confirmPaymentInfo.amount_paid / 100 : ''}
                  onChange={e => onPaymentInfoChange({ ...confirmPaymentInfo, amount_paid: Math.round(parseFloat(e.target.value || '0') * 100) })}
                  className="app-input w-full px-3 py-2 text-sm"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.payDate')}</label>
              <input
                type="date"
                value={confirmPaymentInfo.payment_date ?? new Date().toISOString().slice(0, 10)}
                onChange={e => onPaymentInfoChange({ ...confirmPaymentInfo, payment_date: e.target.value })}
                className="app-input w-full px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-ivory-border px-4 py-2 text-sm text-ink-muted hover:bg-ivory-muted">{t('common.cancel')}</button>
          <Button onClick={onConfirm}>{t('purchases.confirm')}</Button>
        </div>
      </div>
    </div>
  );
}
