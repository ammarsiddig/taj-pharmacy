import { useTranslation } from 'react-i18next';
import * as api from '../../api';
import type { AccountRow, SchedulePaymentData } from '../../types';
import Button from '../ui/Button';

interface Props {
  open: boolean;
  scheduleAmount: number;
  payForm: SchedulePaymentData;
  accounts: AccountRow[];
  accountTypeFor: (accountId: string) => string;
  derivedMethodLabel: (accountId: string) => string;
  onClose: () => void;
  onFormChange: (f: SchedulePaymentData) => void;
  onPay: () => void;
}

export default function PayScheduleModal({
  open,
  scheduleAmount,
  payForm,
  accounts,
  accountTypeFor,
  derivedMethodLabel,
  onClose,
  onFormChange,
  onPay,
}: Props) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[380px] rounded-2xl bg-white p-5 shadow-[var(--shadow-float)] border border-ivory-border">
        <h3 className="mb-1 font-bold text-ink-main">{t('purchases.payScheduleTitle')}</h3>
        <p className="mb-4 text-sm text-ink-muted">
          {t('purchases.payScheduleMsg')} — <span className="font-semibold tabular-nums text-ink-main">{api.formatMoney(scheduleAmount)}</span>
        </p>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.payAccount')}</label>
            <select
              value={payForm.account_id}
              onChange={e => {
                const acctId = e.target.value;
                const derived = api.paymentMethodFromAccountType(accountTypeFor(acctId));
                onFormChange({ ...payForm, account_id: acctId, payment_method: derived });
              }}
              className="app-input w-full px-3 py-2 text-sm"
            >
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name_ar || a.name} — {api.formatMoney(a.current_balance)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.payMethod')}</label>
            <div className="px-3 py-2 text-sm rounded-lg bg-ivory-muted border border-ivory-border text-ink-muted">
              {derivedMethodLabel(payForm.account_id)}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.payDate')}</label>
            <input
              type="date"
              value={payForm.payment_date}
              onChange={e => onFormChange({ ...payForm, payment_date: e.target.value })}
              className="app-input w-full px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.payNotes')}</label>
            <input
              type="text"
              value={payForm.notes ?? ''}
              onChange={e => onFormChange({ ...payForm, notes: e.target.value })}
              className="app-input w-full px-3 py-2 text-sm"
              placeholder={t('common.optional')}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-ivory-border px-4 py-2 text-sm text-ink-muted hover:bg-ivory-muted"
          >
            {t('common.cancel')}
          </button>
          <Button onClick={onPay} disabled={!payForm.account_id}>
            {t('purchases.confirmPay')}
          </Button>
        </div>
      </div>
    </div>
  );
}
