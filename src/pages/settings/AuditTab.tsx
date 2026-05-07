import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../../api';
import type { AuditLogRow } from '../../types';
import Badge from '../../components/ui/Badge';
import Toast from '../../components/ui/Toast';

export default function AuditTab() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);

  const load = useCallback(async () => {
    try { setLogs(await api.getAuditLog(entityFilter || undefined)); }
    catch (e: unknown) { setToast({ msg: String(e), type: 'danger' }); }
    finally { setLoading(false); }
  }, [entityFilter]);

  useEffect(() => { load(); }, [load]);

  const entityTypes = [...new Set(logs.map(l => l.entity_type))];

  if (loading) return <div className="py-12 text-center text-ink-muted">{t('common.loading')}</div>;

  return (
    <div className="space-y-4">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <h3 className="text-base font-bold text-ink-main">{t('settings.audit.title')}</h3>
      <p className="text-sm text-ink-muted">{t('settings.audit.description')}</p>

      <div className="app-panel flex items-center gap-2 p-3">
        <label className="text-xs text-ink-muted">{t('settings.audit.filterByEntity')}:</label>
        <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)}
          className="app-input px-3 py-2 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100">
          <option value="">{t('settings.audit.all')}</option>
          {entityTypes.map(et => <option key={et} value={et}>{et}</option>)}
        </select>
      </div>

      {logs.length === 0 ? (
        <p className="text-sm text-ink-muted py-4">{t('settings.audit.noEntries')}</p>
      ) : (
        <div className="app-card overflow-hidden shadow-none">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-ivory-border bg-surface-secondary">
              <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.audit.date')}</th>
              <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.audit.user')}</th>
              <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.audit.action')}</th>
              <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.audit.entity')}</th>
              <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.audit.entityId')}</th>
            </tr></thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-b border-ivory-border bg-white">
                  <td className="px-4 py-2.5 text-ink-muted text-xs tabular-nums">{l.created_at.slice(0, 19).replace('T', ' ')}</td>
                  <td className="px-4 py-2.5 text-ink-main">{l.user_name || l.user_id.slice(0, 8)}</td>
                  <td className="px-4 py-2.5"><Badge variant={l.action === 'create' ? 'success' : l.action === 'delete' ? 'danger' : 'info'}>{t(`settings.audit.actions.${l.action}` as Parameters<typeof t>[0]) || l.action}</Badge></td>
                  <td className="px-4 py-2.5 text-ink-muted">{l.entity_type}</td>
                  <td className="px-4 py-2.5 text-ink-muted text-xs font-mono">{l.entity_id.slice(0, 8)}...</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
