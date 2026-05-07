import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import Button from '../../components/ui/Button';
import NumericInput from '../../components/ui/NumericInput';
import Numpad from '../../components/ui/Numpad';

interface Props {
  onConfirm: (actualCash: number) => Promise<void>;
  onClose: () => void;
  parkedCount?: number;
}

export default function CloseSessionModal({ onConfirm, onClose, parkedCount = 0 }: Props) {
  const { t } = useTranslation();
  const [actualCash, setActualCash] = useState(0);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    setSaving(true);
    try { await onConfirm(actualCash); }
    finally { setSaving(false); }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40"
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        className="w-full max-w-md mx-4 rounded-2xl border border-ivory-border bg-white p-6 shadow-[var(--shadow-float)]"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-ink-main mb-2">{t('pos.closeSession')}</h3>
        <p className="text-sm text-ink-muted mb-4">{t('pos.closeSessionMsg')}</p>
        {parkedCount > 0 && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">
              {t('pos.closeParkedWarning', { count: parkedCount })}
            </p>
          </div>
        )}
        <div className="mb-4">
          <label className="block text-xs text-ink-muted mb-1">{t('pos.actualCash')}</label>
          <NumericInput
            value={actualCash / 100}
            onChange={v => setActualCash(Math.round(v * 100))}
            min={0}
            step={0.01}
            className="text-center"
          />
        </div>
        <div className="flex justify-center mb-4">
          <Numpad
            initialValue={actualCash > 0 ? actualCash / 100 : 0}
            decimals={2}
            onConfirm={v => setActualCash(Math.round(v * 100))}
            onCancel={() => setActualCash(0)}
          />
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={handleConfirm} disabled={saving}>
            {saving ? t('common.loading') : t('pos.closeSession')}
          </Button>
        </div>
      </div>
    </div>
  );
}
