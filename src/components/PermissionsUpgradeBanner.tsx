import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { invoke } from '../lib/tauri';
import { getTenantId } from '../api/core';

export default function PermissionsUpgradeBanner() {
  const { role } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (role?.name !== 'owner') return;
    invoke<boolean>('get_permissions_upgrade_banner', { tenantId: getTenantId() })
      .then(setVisible)
      .catch(() => {});
  }, [role]);

  if (!visible) return null;

  const dismiss = () => {
    invoke('dismiss_permissions_upgrade_banner', { tenantId: getTenantId() })
      .then(() => setVisible(false))
      .catch(() => {});
  };

  return (
    <div className="bg-primary-50 border-b border-primary-200 px-4 py-3 text-center">
      <p className="text-sm text-primary-800">
        تم ترقية نظام الصلاحيات — راجع أدوار المستخدمين في الإعدادات.
      </p>
      <div className="flex justify-center gap-3 mt-2">
        <a
          href="/settings?tab=permissions"
          className="rounded-xl bg-primary-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 transition-colors"
        >
          مراجعة الآن
        </a>
        <button
          onClick={dismiss}
          className="rounded-xl bg-white px-4 py-1.5 text-xs font-medium text-ink-muted border border-ivory-border hover:bg-surface-secondary transition-colors"
        >
          تخطّي
        </button>
      </div>
    </div>
  );
}
