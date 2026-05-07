/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { getLicenseInfo, checkLicenseOnline } from '../api';
import type { LicenseInfo } from '../types';
import { FEATURE_FLAGS } from './usePermission';

// All flags enabled (used when license cannot be loaded)
const ALL_FLAGS = Object.values(FEATURE_FLAGS).reduce((a, b) => a | b, 0);

interface LicenseContextValue {
  license: LicenseInfo | null;
  loading: boolean;
  refresh: () => Promise<void>;
  hasFeature: (flag: number) => boolean;
  /** true when expired AND past grace period */
  isBlocked: boolean;
  /** true when backend considers license read-only */
  isReadOnly: boolean;
  /** true when in 7-day grace window after expiry */
  isInGrace: boolean;
  /** true when valid license expires within 14 days */
  isNearExpiry: boolean;
  daysUntilExpiry: number | null;
  graceDaysRemaining: number | null;
}

const LicenseContext = createContext<LicenseContextValue>({
  license: null,
  loading: true,
  refresh: async () => {},
  hasFeature: () => true,
  isBlocked: false,
  isReadOnly: false,
  isInGrace: false,
  isNearExpiry: false,
  daysUntilExpiry: null,
  graceDaysRemaining: null,
});

export function LicenseProvider({ children }: { children: ReactNode }) {
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const info = await getLicenseInfo();
      setLicense(info);
    } catch {
      // On error allow all features — don't block the user
      setLicense(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Re-check every 5 minutes
    const timer = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [refresh]);

  // Online heartbeat: check against license server on mount then every 24 h
  useEffect(() => {
    const runOnlineCheck = async () => {
      try {
        const result = await checkLicenseOnline();
        // If the server confirmed revocation, refresh local state immediately
        if (result.checked && result.revoked) {
          await refresh();
        }
      } catch {
        // Non-fatal — server may not be configured
      }
    };
    runOnlineCheck();
    const heartbeatTimer = setInterval(runOnlineCheck, 24 * 60 * 60 * 1000);
    return () => clearInterval(heartbeatTimer);
  }, [refresh]);

  const hasFeature = useCallback(
    (flag: number): boolean => {
      if (!license) return true;
      const flags = license.feature_flags === 0 ? ALL_FLAGS : license.feature_flags;
      return (flags & flag) !== 0;
    },
    [license]
  );

  const isReadOnly = license?.is_read_only ?? false;
  const isBlocked = isReadOnly;
  const isInGrace = license?.in_grace_period ?? false;
  const daysUntilExpiry = license?.days_until_expiry ?? null;
  const graceDaysRemaining = license?.grace_days_remaining ?? null;
  // Near-expiry: valid, not yet in grace, ≤ 14 days left
  const isNearExpiry =
    !isInGrace && daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 14;

  return (
    <LicenseContext.Provider
      value={{
        license,
        loading,
        refresh,
        hasFeature,
        isBlocked,
        isReadOnly,
        isInGrace,
        isNearExpiry,
        daysUntilExpiry,
        graceDaysRemaining,
      }}
    >
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  return useContext(LicenseContext);
}
