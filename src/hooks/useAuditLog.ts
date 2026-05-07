import { useCallback } from 'react';
import { writeAuditLog } from '../api';
import { useAuth } from './useAuth';

export function useAuditLog() {
  const { user } = useAuth();

  const log = useCallback(
    async (action: string, entityType: string, entityId: string, changesJson?: string) => {
      if (!user) return;
      try {
        await writeAuditLog(user.id, { action, entity_type: entityType, entity_id: entityId, changes_json: changesJson });
      } catch (err) {
        console.error('Audit log write failed:', err);
      }
    },
    [user],
  );

  return { log };
}
