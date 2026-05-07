import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  FileText,
  ShoppingBag,
  Package,
  Warehouse,
  Receipt,
  BarChart3,
  Settings,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLicense } from '../../hooks/useLicense';
import { FEATURE_FLAGS } from '../../hooks/usePermission';

interface NavItem {
  key: string;
  path: string;
  icon: LucideIcon;
  group: 'core' | 'ops' | 'admin';
  /** Feature flag that controls access — undefined means always accessible */
  featureFlag?: number;
}

const navItems: NavItem[] = [
  { key: 'dashboard',  path: '/dashboard',  icon: LayoutDashboard, group: 'core' },
  { key: 'pos',        path: '/pos',        icon: ShoppingCart,    group: 'core',  featureFlag: FEATURE_FLAGS.POS },
  { key: 'sales',      path: '/sales',      icon: FileText,        group: 'ops',   featureFlag: FEATURE_FLAGS.SALES },
  { key: 'purchases',  path: '/purchases',  icon: ShoppingBag,     group: 'ops',   featureFlag: FEATURE_FLAGS.PURCHASES },
  { key: 'products',   path: '/products',   icon: Package,         group: 'ops',   featureFlag: FEATURE_FLAGS.PRODUCTS },
  { key: 'warehouse',  path: '/warehouse',  icon: Warehouse,       group: 'ops',   featureFlag: FEATURE_FLAGS.WAREHOUSE },
  { key: 'expenses',   path: '/expenses',   icon: Receipt,         group: 'ops',   featureFlag: FEATURE_FLAGS.EXPENSES },
  { key: 'reports',    path: '/reports',    icon: BarChart3,       group: 'admin', featureFlag: FEATURE_FLAGS.REPORTS },
  { key: 'settings',   path: '/settings',   icon: Settings,        group: 'admin' },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { hasFeature } = useLicense();
  return (
    <aside className={`${collapsed ? 'w-[78px]' : 'w-[256px]'} min-h-screen bg-[#1C5F6F] flex flex-col shrink-0 transition-[width] duration-200 border-l border-white/6 shadow-[0_20px_40px_-24px_rgb(0_0_0_/_0.6)]`}>
      {/* Logo area */}
      <div className="px-4 py-5 border-b border-white/8 flex items-center justify-between">
        {!collapsed && (
          <div>
            <h1 className="text-white text-lg font-bold">TAJ Pharmacy</h1>
            <p className="text-brand-100/75 text-xs mt-0.5">{t('app.title')}</p>
          </div>
        )}
        <button onClick={onToggle} className="text-brand-100 hover:text-white p-2 rounded-full hover:bg-white/6">
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {navItems.map((item, idx) => {
          const Icon = item.icon;
          const isLocked = item.featureFlag !== undefined && !hasFeature(item.featureFlag);
          const isActive = !isLocked && location.pathname.startsWith(item.path);
          const showDivider = idx > 0 && navItems[idx - 1].group !== item.group;

          if (isLocked) {
            return (
              <div key={item.key}>
                {showDivider && <div className="mx-4 my-3 h-px bg-white/8" />}
                <div
                  className={`flex items-center gap-3 px-4 py-3 mx-3 rounded-full text-brand-100/35 cursor-not-allowed select-none ${collapsed ? 'justify-center' : ''}`}
                  title={collapsed ? t(`nav.${item.key}`) : t('settings.license.featureLocked')}
                >
                  <Icon size={18} />
                  {!collapsed && <span className="text-sm flex-1">{t(`nav.${item.key}`)}</span>}
                  {!collapsed && <Lock size={12} className="opacity-60" />}
                </div>
              </div>
            );
          }

          return (
            <div key={item.key}>
              {showDivider && <div className="mx-4 my-3 h-px bg-white/8" />}
              <NavLink
                to={item.path}
                title={collapsed ? t(`nav.${item.key}`) : undefined}
                className={`relative flex items-center gap-3 px-4 py-3 mx-3 rounded-full text-sm transition-colors
                  ${collapsed ? 'justify-center' : ''}
                  ${isActive
                    ? 'bg-white/20 text-white shadow-[inset_0_1px_0_rgb(255_255_255_/_0.15)]'
                    : 'text-white/75 hover:bg-white/10 hover:text-white'}`}
              >
                {isActive && <span className="absolute right-0 top-2 bottom-2 w-[3px] rounded-full bg-brand-200" />}
                <Icon size={18} />
                {!collapsed && <span>{t(`nav.${item.key}`)}</span>}
              </NavLink>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
