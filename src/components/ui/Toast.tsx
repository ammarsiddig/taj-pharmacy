import { useEffect, useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

type ToastType = 'success' | 'warning' | 'danger';

interface ToastProps {
  message: string;
  type?: ToastType;
  onClose: () => void;
  duration?: number;
}

const styles: Record<ToastType, { border: string; bg: string }> = {
  success: { border: 'border-s-status-success', bg: 'bg-status-success-bg' },
  warning: { border: 'border-s-status-warning', bg: 'bg-status-warning-bg' },
  danger:  { border: 'border-s-status-danger',  bg: 'bg-status-danger-bg'  },
};

const TypeIcon = ({ type }: { type: ToastType }) => {
  if (type === 'success') return <CheckCircle size={16} className="text-status-success shrink-0" />;
  if (type === 'warning') return <AlertTriangle size={16} className="text-status-warning shrink-0" />;
  return <XCircle size={16} className="text-status-danger shrink-0" />;
};

export default function Toast({ message, type = 'success', onClose, duration }: ToastProps) {
  const [visible, setVisible] = useState(true);
  const effectiveDuration = duration ?? (type === 'danger' ? 5000 : 3000);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), effectiveDuration);
    return () => clearTimeout(timer);
  }, [effectiveDuration]);

  useEffect(() => {
    if (!visible) {
      const t = setTimeout(onClose, 200);
      return () => clearTimeout(t);
    }
  }, [visible, onClose]);

  const { border, bg } = styles[type];
  return (
    <div
      className={`fixed top-20 start-4 z-[80] max-w-sm px-4 py-3 rounded-xl border-s-4 shadow-lg animate-in ${border} ${bg} ${!visible ? 'opacity-0 -translate-y-2 transition-all duration-200' : ''}`}
      role="alert"
    >
      <div className="flex items-center gap-2">
        <TypeIcon type={type} />
        <span className="text-sm text-ink-main leading-relaxed">{message}</span>
      </div>
    </div>
  );
}
