import { useTranslation } from 'react-i18next';
import Button from '../../components/ui/Button';

interface Props {
  open: boolean;
  pharmacistId: string;
  saving: boolean;
  onClose: () => void;
  onChange: (v: string) => void;
  onConfirm: () => void;
}

export default function RxModal({ open, pharmacistId, saving, onClose, onChange, onConfirm }: Props) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-ivory-app rounded-2xl shadow-[var(--shadow-float)] w-full max-w-sm mx-4 p-6">
        <h3 className="font-bold text-ink-main mb-1">{t('pos.rxTitle')}</h3>
        <p className="text-sm text-ink-muted mb-4">{t('pos.rxHint')}</p>
        <label className="block text-xs font-medium text-ink-main mb-1" htmlFor="rx-pharmacist-id">
          {t('pos.rxPharmacistId')}
        </label>
        <input
          id="rx-pharmacist-id"
          className="inp w-full mb-4"
          placeholder={t('pos.rxPharmacistPlaceholder')}
          value={pharmacistId}
          onChange={e => onChange(e.target.value)}
          autoFocus
        />
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!pharmacistId.trim() || saving} loading={saving} onClick={onConfirm}>
            {t('pos.rxConfirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
