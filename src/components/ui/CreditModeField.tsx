import { useTranslation } from 'react-i18next';
import NumericInput from './NumericInput';

export type CreditMode = 'cash' | 'unlimited' | 'limit';

// Map a stored credit_limit (piasters) to the UI mode + display amount (SDG units).
// Sentinels: -1 = unlimited, 0 = cash-only, >0 = a specific limit.
export function creditLimitToMode(piasters: number): { mode: CreditMode; amount: number } {
  if (piasters < 0) return { mode: 'unlimited', amount: 0 };
  if (piasters === 0) return { mode: 'cash', amount: 0 };
  return { mode: 'limit', amount: piasters / 100 };
}

// Resolve UI mode + display amount (SDG units) back to a stored credit_limit (piasters).
// Returns null when the selection is invalid (limit mode with amount <= 0) so the
// caller can reject the save instead of silently sending 0 (which means cash-only).
export function modeToCreditLimit(mode: CreditMode, amount: number): number | null {
  if (mode === 'unlimited') return -1;
  if (mode === 'cash') return 0;
  const piasters = Math.round(amount * 100);
  return piasters > 0 ? piasters : null;
}

interface CreditModeFieldProps {
  mode: CreditMode;
  /** Display amount in SDG units (only used in 'limit' mode). */
  amount: number;
  onModeChange: (mode: CreditMode) => void;
  onAmountChange: (amount: number) => void;
}

/**
 * Three-way credit selector reused by every customer create/edit path:
 * Cash only (0) / Unlimited credit (-1) / Limit to [amount] (>0). The amount
 * input is shown only in "Limit to" mode.
 */
export default function CreditModeField({ mode, amount, onModeChange, onAmountChange }: CreditModeFieldProps) {
  const { t } = useTranslation();
  const options: { value: CreditMode; label: string }[] = [
    { value: 'cash', label: t('customers.creditModeCashOnly') },
    { value: 'unlimited', label: t('customers.creditModeUnlimited') },
    { value: 'limit', label: t('customers.creditModeLimit') },
  ];
  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-ink-main">{t('customers.creditMode')}</span>
      <div className="grid grid-cols-3 gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onModeChange(opt.value)}
            className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
              mode === opt.value
                ? 'border-primary-500 bg-primary-100 text-primary-700'
                : 'border-ivory-border bg-white text-ink-muted hover:bg-ivory-muted'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {mode === 'limit' && (
        <NumericInput
          label={t('customers.creditLimit') + ' (' + t('common.currency') + ')'}
          value={amount}
          onChange={onAmountChange}
          step={0.01}
          min={0}
          className="tabular-nums"
        />
      )}
    </div>
  );
}
