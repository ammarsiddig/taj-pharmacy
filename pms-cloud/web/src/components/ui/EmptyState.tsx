import type { ReactNode } from 'react';
import Icon from './Icon';

interface EmptyStateProps {
  icon: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <Icon name={icon} size={48} className="mb-4" style={{ color: 'var(--color-ink-placeholder)' }} />
      <p className="font-bold text-ink-main mb-1">{title}</p>
      {description && <p className="text-sm text-ink-muted max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
