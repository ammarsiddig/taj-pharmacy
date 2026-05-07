import { useTranslation } from 'react-i18next';
import Badge from '../../components/ui/Badge';

const SYSTEM_ROLES = [
  { nameAr: 'مالك', nameEn: 'owner', permsKey: 'allPermissions' },
  { nameAr: 'مدير', nameEn: 'manager', permsKey: 'allExceptLicense' },
  { nameAr: 'صيدلاني', nameEn: 'pharmacist', permsKey: 'posProductsWarehouse' },
  { nameAr: 'كاشير', nameEn: 'cashier', permsKey: 'posOnly' },
];

export default function RolesTab() {
  const { t } = useTranslation();

  return (
    <div>
      <div className="app-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ivory-border bg-surface-secondary">
              <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.roleName')}</th>
              <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.roleNameEn')}</th>
              <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.roleType')}</th>
              <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.defaultPermissions')}</th>
            </tr>
          </thead>
          <tbody>
            {SYSTEM_ROLES.map((role) => (
              <tr key={role.nameEn} className="border-b border-ivory-border bg-white">
                <td className="px-4 py-2.5 font-medium text-ink-main">{t(`settings.roles.${role.nameEn}`)}</td>
                <td className="px-4 py-2.5 text-ink-muted">{role.nameEn}</td>
                <td className="px-4 py-2.5">
                  <Badge variant="neutral">{t('settings.systemType')}</Badge>
                </td>
                <td className="px-4 py-2.5 text-ink-muted">{t(`settings.${role.permsKey}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-muted">{t('settings.systemRole')}</p>
    </div>
  );
}
