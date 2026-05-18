import { useEffect, useRef, type ReactNode } from 'react';
import Icon from './Icon';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export default function Modal({ open, onClose, title, children, size = 'sm' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const widthMap = { sm: '320px', md: '480px', lg: '640px' };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[90] flex items-end md:items-center justify-center p-4"
      style={{ background: 'rgb(13 32 35 / 0.4)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="app-panel p-5 w-full max-h-[85dvh] overflow-y-auto animate-slideUp"
        style={{
          maxWidth: widthMap[size],
          borderRadius: '16px 16px 0 0',
          paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-ink-main">{title}</h2>
            <button onClick={onClose} className="touch-target flex items-center justify-center rounded-lg hover:bg-ivory-muted" aria-label="Close">
              <Icon name="x" size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-slideUp { animation: slideUp 0.25s var(--ease-out); }
        @media (min-width: 768px) {
          .animate-slideUp { animation: fadeIn 0.2s var(--ease-out); }
          @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        }
      `}</style>
    </div>
  );
}
