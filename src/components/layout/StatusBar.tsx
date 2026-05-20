import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSyncStatus } from '../../App';
import { getBranchId } from '../../api';

export default function StatusBar() {
  const { i18n } = useTranslation();
  const { syncError } = useSyncStatus();
  const [time, setTime] = useState(formatTime(i18n.language));

  useEffect(() => {
    const interval = setInterval(() => setTime(formatTime(i18n.language)), 60_000);
    return () => clearInterval(interval);
  }, [i18n.language]);

  const branchId = getBranchId();
  const branchLabel = branchId === 'default' ? 'الرئيسي' : branchId.slice(0, 8);

  return (
    <footer className="h-7 bg-primary-900 flex items-center px-4 text-xs text-white shrink-0">
      <span className="font-bold">TAJ Pharmacy v4</span>
      <span className="ms-3">Branch: {branchLabel}</span>

      {syncError && (
        <span className="flex items-center gap-1 text-status-danger font-semibold ml-3">
          <span className="inline-block w-2 h-2 rounded-full bg-status-danger animate-pulse" />
          فشل المزامنة
        </span>
      )}

      <span className="ms-auto tabular-nums">{time}</span>
    </footer>
  );
}

function formatTime(locale: string) {
  const now = new Date();
  const date = now.toLocaleDateString(locale, {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const clock = now.toLocaleTimeString(locale, {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
  return `${date}  ${clock}`;
}
