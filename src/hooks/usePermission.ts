import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { getLicenseInfo } from '../api';

export function usePermission(feature: string): boolean {
  const { permissions } = useAuth();
  return permissions.includes(feature);
}

export function useHasAnyPermission(features: string[]): boolean {
  const { permissions } = useAuth();
  return features.some((f) => permissions.includes(f));
}

// ─── Feature Flags (bitmask from tenant.feature_flags) ─────────────────────
// Bit positions for subscription features
export const FEATURE_FLAGS = {
  POS:           1 << 0,  // 1
  PRODUCTS:      1 << 1,  // 2
  PURCHASES:     1 << 2,  // 4
  WAREHOUSE:     1 << 3,  // 8
  SALES:         1 << 4,  // 16
  EXPENSES:      1 << 5,  // 32
  CUSTOMERS:     1 << 6,  // 64
  SUPPLIERS:     1 << 7,  // 128
  ACCOUNTS:      1 << 8,  // 256
  REPORTS:       1 << 9,  // 512
  MULTI_BRANCH:  1 << 10, // 1024
  ADVANCED_REPORTS: 1 << 11, // 2048
  BACKUP:        1 << 12, // 4096
  AUDIT_LOG:     1 << 13, // 8192
  ASSETS:        1 << 14, // 16384
} as const;

// All flags enabled (for basic plan or feature_flags = 0 means "all enabled")
const ALL_FLAGS = Object.values(FEATURE_FLAGS).reduce((a, b) => a | b, 0);

/**
 * Legacy hook: still works standalone (fetches its own copy).
 * Prefer useLicense() from useLicense.tsx for components that need full info.
 */
export function useFeatureFlags(): number {
  const [flags, setFlags] = useState<number>(ALL_FLAGS);

  useEffect(() => {
    let cancelled = false;
    getLicenseInfo()
      .then(info => {
        if (!cancelled) {
          setFlags(info.feature_flags === 0 ? ALL_FLAGS : info.feature_flags);
        }
      })
      .catch(() => {
        if (!cancelled) setFlags(ALL_FLAGS);
      });
    return () => { cancelled = true; };
  }, []);

  return flags;
}

export function useFeatureFlag(flag: number): boolean {
  const flags = useFeatureFlags();
  return (flags & flag) !== 0;
}

export function hasFeature(flags: number, flag: number): boolean {
  if (flags === 0) return true; // 0 = all enabled
  return (flags & flag) !== 0;
}
