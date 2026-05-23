import { useAuth } from './useAuth';
import type { PermissionLevel } from '../types/auth';

const RANK: Record<PermissionLevel, number> = { none: 0, read: 1, write: 2 };

export function usePermissions() {
  const { permissions } = useAuth();

  function level(resource: string): PermissionLevel {
    const entry = permissions.find((p) => p.resource === resource);
    return entry ? (entry.level as PermissionLevel) : 'none';
  }

  function has(resource: string, minLevel: PermissionLevel = 'read'): boolean {
    if (minLevel === 'none') return true;
    return RANK[level(resource)] >= RANK[minLevel];
  }

  function hasAny(resources: string[], minLevel: PermissionLevel = 'read'): boolean {
    if (minLevel === 'none') return true;
    return resources.some((r) => has(r, minLevel));
  }

  return { has, hasAny, level };
}
