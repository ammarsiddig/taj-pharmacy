interface BadgeProps {
  variant: 'success' | 'warning' | 'danger' | 'neutral' | 'info';
  children: React.ReactNode;
}

const variantClasses = {
  success: 'bg-status-success-bg text-status-success',
  warning: 'bg-status-warning-bg text-status-warning',
  danger: 'bg-status-danger-bg text-status-danger',
  neutral: 'bg-ivory-muted text-ink-muted',
  info: 'bg-primary-100 text-primary-700',
};

export default function Badge({ variant, children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-sm ${variantClasses[variant]}`}>
      {children}
    </span>
  );
}
