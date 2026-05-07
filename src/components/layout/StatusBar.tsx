import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';

export default function StatusBar() {
  const { user, role } = useAuth();
  const [time, setTime] = useState(formatTime());

  useEffect(() => {
    const interval = setInterval(() => setTime(formatTime()), 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <footer className="h-7 bg-primary-900 flex items-center px-4 text-xs text-white shrink-0">
      {/* Right: user info */}
      <span>
        {user?.full_name_ar || user?.full_name} — {role?.name_ar || role?.name}
      </span>

      {/* Left: date/time */}
      <span className="mr-auto tabular-nums">{time}</span>
    </footer>
  );
}

function formatTime() {
  const now = new Date();
  const date = now.toLocaleDateString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const clock = now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
  return `${date}  ${clock}`;
}
