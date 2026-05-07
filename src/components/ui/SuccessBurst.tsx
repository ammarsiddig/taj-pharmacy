import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

interface SuccessBurstProps {
  show: boolean;
  size?: number;
  className?: string;
}

export default function SuccessBurst({ show, size = 24, className = '' }: SuccessBurstProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      const t = setTimeout(() => setVisible(false), 1500);
      return () => clearTimeout(t);
    }
  }, [show]);

  if (!visible) return null;
  return (
    <div
      className={`animate-check-burst inline-flex items-center justify-center rounded-full bg-status-success ${className}`}
      style={{ width: size, height: size }}
    >
      <Check size={size * 0.6} className="text-white" strokeWidth={3} />
    </div>
  );
}
