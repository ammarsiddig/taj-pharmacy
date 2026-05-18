interface BadgeProps {
  children: string;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  size?: 'sm' | 'md';
  className?: string;
}

const variantStyles: Record<string, { bg: string; color: string }> = {
  success: { bg: 'var(--color-status-success-bg)', color: 'var(--color-status-success)' },
  warning: { bg: 'var(--color-status-warning-bg)', color: 'var(--color-status-warning)' },
  danger: { bg: 'var(--color-status-danger-bg)', color: 'var(--color-status-danger)' },
  info: { bg: 'var(--color-primary-50)', color: 'var(--color-primary-700)' },
  neutral: { bg: 'var(--color-ivory-muted)', color: 'var(--color-ink-muted)' },
};

export default function Badge({ children, variant = 'neutral', size = 'sm', className = '' }: BadgeProps) {
  const s = variantStyles[variant] || variantStyles.neutral;
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';
  return (
    <span
      className={`inline-flex items-center rounded-full font-bold ${sizeClass} ${className}`}
      style={{ background: s.bg, color: s.color }}
    >
      {children}
    </span>
  );
}
