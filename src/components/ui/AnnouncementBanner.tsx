import { useState } from 'react';
import { X, AlertTriangle, Info, AlertCircle } from 'lucide-react';

interface AnnouncementBannerProps {
  message: string;
  type: 'info' | 'warning' | 'danger';
}

const CONFIG = {
  info:    { bg: 'bg-primary-50 border-primary-200',    text: 'text-primary-800',  Icon: Info          },
  warning: { bg: 'bg-amber-50 border-amber-200',      text: 'text-amber-800',   Icon: AlertTriangle },
  danger:  { bg: 'bg-red-50 border-red-200',          text: 'text-status-danger', Icon: AlertCircle },
} as const;

export default function AnnouncementBanner({ message, type }: AnnouncementBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const { bg, text, Icon } = CONFIG[type];

  return (
    <div className={`flex items-start gap-3 px-4 py-3 border-b text-sm ${bg} ${text}`} dir="rtl">
      <Icon size={16} className="mt-0.5 shrink-0" />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="إغلاق"
      >
        <X size={14} />
      </button>
    </div>
  );
}
