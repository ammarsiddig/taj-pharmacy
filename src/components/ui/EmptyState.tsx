import type { ReactNode } from 'react';
import Button from './Button';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 animate-in">
      {icon && <div className="text-ink-placeholder">{icon}</div>}
      <p className="text-lg font-bold text-ink-main text-center">{title}</p>
      {description && <p className="text-sm text-ink-muted max-w-xs text-center">{description}</p>}
      {action && (
        <Button variant="primary" size="sm" onClick={action.onClick}>{action.label}</Button>
      )}
    </div>
  );
}
