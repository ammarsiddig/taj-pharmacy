import { usePermissions } from '../hooks/usePermissions';

interface CanProps {
  resource: string;
  level?: 'none' | 'read' | 'write';
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function Can({
  resource,
  level = 'read',
  fallback = null,
  children,
}: CanProps) {
  const { has } = usePermissions();
  if (has(resource, level)) {
    return <>{children}</>;
  }
  return <>{fallback}</>;
}
