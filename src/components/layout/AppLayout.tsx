import { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import StatusBar from './StatusBar';
import { useLicense } from '../../hooks/useLicense';
import { useAppMode } from '../../hooks/useAppMode';
import ReadOnlyBanner from '../ui/ReadOnlyBanner';
import AnnouncementBanner from '../ui/AnnouncementBanner';
import PermissionsUpgradeBanner from '../PermissionsUpgradeBanner';

function LicenseBanner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isBlocked, isInGrace, isNearExpiry, daysUntilExpiry, graceDaysRemaining } = useLicense();

  if (!isBlocked && !isInGrace && !isNearExpiry) return null;

  const goToLicense = () => navigate('/settings', { state: { tab: 'license' } });

  if (isBlocked) {
    return (
      <div className="flex items-center justify-between gap-3 bg-status-danger px-5 py-2.5 text-white text-sm">
        <span className="font-semibold">⚠ {t('license.banner.expired')}</span>
        <button onClick={goToLicense} className="underline text-white/90 hover:text-white text-xs shrink-0">
          {t('license.banner.renewNow')}
        </button>
      </div>
    );
  }

  if (isInGrace) {
    return (
      <div className="flex items-center justify-between gap-3 bg-status-warning px-5 py-2.5 text-white text-sm">
        <span className="font-semibold">⏳ {t('license.banner.grace', { days: graceDaysRemaining ?? 0 })}</span>
        <button onClick={goToLicense} className="underline text-white/90 hover:text-white text-xs shrink-0">
          {t('license.banner.renewNow')}
        </button>
      </div>
    );
  }

  // Near expiry (≤ 14 days)
  return (
    <div className="flex items-center justify-between gap-3 bg-amber-500 px-5 py-2 text-white text-sm">
      <span>{t('license.banner.nearExpiry', { days: daysUntilExpiry ?? 0 })}</span>
      <button onClick={goToLicense} className="underline text-white/90 hover:text-white text-xs shrink-0">
        {t('license.banner.renewNow')}
      </button>
    </div>
  );
}

const COLLAPSE_BREAKPOINT = 1400;

export default function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth <= COLLAPSE_BREAKPOINT);
  const { isReadOnly, isSuspended, announcement, announcementType } = useAppMode();

  useEffect(() => {
    function handleResize() {
      setSidebarCollapsed(window.innerWidth <= COLLAPSE_BREAKPOINT);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* RTL: Sidebar on the right */}
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)} />

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />
        <LicenseBanner />
        {isReadOnly && <ReadOnlyBanner isSuspended={isSuspended} />}
        {announcement && <AnnouncementBanner message={announcement} type={announcementType} />}
        <PermissionsUpgradeBanner />
        <main className="flex-1 overflow-auto bg-ivory-app p-5 md:p-6">
          <Outlet />
        </main>
        <StatusBar />
      </div>
    </div>
  );
}
