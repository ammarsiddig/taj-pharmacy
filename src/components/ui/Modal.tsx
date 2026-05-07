import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Button from './Button';

interface ModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  onConfirm: () => void;
  onCancel: () => void;
}

const sizeClasses = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' };

export default function Modal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  size = 'md',
  onConfirm,
  onCancel,
}: ModalProps) {
  const { t } = useTranslation();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      confirmRef.current?.focus();
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onCancel();
        if (e.key === 'Enter') { e.preventDefault(); onConfirm(); }
      };
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    }
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        className={`bg-ivory-surface rounded-2xl shadow-lg p-6 w-full mx-4 animate-scale-in ${sizeClasses[size]} ${variant === 'danger' ? 'border-t-4 border-t-status-danger' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-ink-main mb-2">{title}</h3>
        <p className="text-sm text-ink-muted mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onCancel}>{cancelLabel ?? t('common.cancel')}</Button>
          <Button ref={confirmRef} variant={variant === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
