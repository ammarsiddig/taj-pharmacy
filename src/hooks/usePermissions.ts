import { useAuth } from './useAuth';

export function usePermissions() {
  const { permissions } = useAuth();

  function has(resource: string, minLevel: 'none' | 'read' | 'write' = 'read'): boolean {
    if (minLevel === 'none') return true;
    return permissions.includes(resource);
  }

  function hasAny(resources: string[], minLevel: 'none' | 'read' | 'write' = 'read'): boolean {
    if (minLevel === 'none') return true;
    return resources.some((r) => permissions.includes(r));
  }

  function level(resource: string): 'none' | 'read' | 'write' {
    if (permissions.includes(resource)) return 'write';
    return 'none';
  }

  return { has, hasAny, level };
}
