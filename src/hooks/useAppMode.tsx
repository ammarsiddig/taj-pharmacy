/* eslint-disable react-refresh/only-export-components */
import {
  createContext, useContext, useState, useEffect, useCallback, type ReactNode,
} from 'react';
import { fetchCloudConfig, getCloudRemoteConfigCached } from '../api';
import type { CloudRemoteConfig } from '../types';

const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

interface AppModeContextValue {
  isReadOnly: boolean;
  isSuspended: boolean;
  announcement: string | null;
  announcementType: 'info' | 'warning' | 'danger';
  cloudConfig: CloudRemoteConfig | null;
  refresh: () => Promise<void>;
}

const AppModeContext = createContext<AppModeContextValue>({
  isReadOnly: false,
  isSuspended: false,
  announcement: null,
  announcementType: 'info',
  cloudConfig: null,
  refresh: async () => {},
});

export function AppModeProvider({ children }: { children: ReactNode }) {
  const [cloudConfig, setCloudConfig] = useState<CloudRemoteConfig | null>(null);

  const refresh = useCallback(async () => {
    try {
      const config = await fetchCloudConfig();
      setCloudConfig(config);
    } catch {
      // Network unavailable — fall back to cached value
      try {
        const cached = await getCloudRemoteConfigCached();
        setCloudConfig(cached);
      } catch {
        // DB unavailable — fail open
      }
    }
  }, []);

  // Load cached value immediately on mount, then fetch live
  useEffect(() => {
    getCloudRemoteConfigCached()
      .then((cached) => setCloudConfig(cached))
      .catch(() => {});
    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const status = cloudConfig?.status ?? 'active';
  const isSuspended = status === 'suspended';
  const isReadOnly = isSuspended || status === 'expired';
  const announcement = cloudConfig?.announcement ?? null;
  const rawType = cloudConfig?.announcement_type ?? 'info';
  const announcementType: 'info' | 'warning' | 'danger' =
    rawType === 'warning' ? 'warning' : rawType === 'danger' ? 'danger' : 'info';

  return (
    <AppModeContext.Provider value={{ isReadOnly, isSuspended, announcement, announcementType, cloudConfig, refresh }}>
      {children}
    </AppModeContext.Provider>
  );
}

export function useAppMode() {
  return useContext(AppModeContext);
}
