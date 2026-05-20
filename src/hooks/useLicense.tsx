/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { getLicenseInfo, checkLicenseOnline } from '../api';
import type { LicenseInfo } from '../types';
import { FEATURE_FLAGS } from './usePermission';

const ALL_FLAGS = Object.values(FEATURE_FLAGS).reduce((a, b) => a | b, 0);

interface LicenseContextValue {
  license: LicenseInfo | null;
  loading: boolean;
  licenseError: boolean;
  refresh: () => Promise<void>;
  hasFeature: (flag: number) => boolean;
  isBlocked: boolean;
  isReadOnly: boolean;
  isInGrace: boolean;
  isNearExpiry: boolean;
  daysUntilExpiry: number | null;
  graceDaysRemaining: number | null;
}

const LicenseContext = createContext<LicenseContextValue>({
  license: null,
  loading: true,
  licenseError: false,
  refresh: async () => {},
  hasFeature: () => false,
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
  const [licenseError, setLicenseError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const info = await getLicenseInfo();
      setLicense(info);
      setLicenseError(false);
    } catch {
      setLicense(null);
      setLicenseError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const runOnlineCheck = async () => {
      try {
        const result = await checkLicenseOnline();
        if (result.checked && result.revoked) {
          await refresh();
        }
      } catch {
      }
    };
    runOnlineCheck();
    const heartbeatTimer = setInterval(runOnlineCheck, 24 * 60 * 60 * 1000);
    return () => clearInterval(heartbeatTimer);
  }, [refresh]);

  const hasFeature = useCallback(
    (flag: number): boolean => {
      if (!license) return false;
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
  const isNearExpiry =
    !isInGrace && daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 14;

  return (
    <LicenseContext.Provider
      value={{
        license,
        loading,
        licenseError,
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
