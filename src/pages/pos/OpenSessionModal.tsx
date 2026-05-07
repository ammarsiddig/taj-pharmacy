import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../../components/ui/Button';
import NumericInput from '../../components/ui/NumericInput';
import Numpad from '../../components/ui/Numpad';

interface Props {
  onConfirm: (openingCash: number) => Promise<void>;
  onClose: () => void;
}

export default function OpenSessionModal({ onConfirm, onClose }: Props) {
  const { t } = useTranslation();
  const [openingCash, setOpeningCash] = useState(0);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    setSaving(true);
    try { await onConfirm(openingCash); }
    finally { setSaving(false); }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40"
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-2xl border border-ivory-border bg-white p-6 shadow-[var(--shadow-float)]"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-ink-main mb-4">{t('pos.openSession')}</h3>
        <div className="mb-4">
          <label className="block text-xs text-ink-muted mb-1">{t('pos.openingCash')} ({t('common.currency')})</label>
          <NumericInput
            value={openingCash / 100}
            onChange={v => setOpeningCash(Math.round(v * 100))}
            min={0}
            step={0.01}
            className="text-lg text-center"
            autoFocus
          />
        </div>
        <div className="flex justify-center mb-4">
          <Numpad
            initialValue={openingCash > 0 ? openingCash / 100 : 0}
            decimals={2}
            onConfirm={v => setOpeningCash(Math.round(v * 100))}
            onCancel={() => setOpeningCash(0)}
          />
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {saving ? t('common.loading') : t('pos.openSessionBtn')}
          </Button>
        </div>
      </div>
    </div>
  );
}
