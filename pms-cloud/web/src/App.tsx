import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isAuthenticated, isAdminAuthenticated } from './api';
import Login from './pages/Login';
import AdminLogin from './pages/AdminLogin';
import AdminPanel from './pages/AdminPanel';
import OwnerApp from './pages/OwnerApp';
import { ToastProvider } from './components/ui/Toast';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const isAdminPath = window.location.pathname.startsWith('/mgmt');

export default function App() {
  const [authed, setAuthed] = useState(
    isAdminPath ? isAdminAuthenticated() : isAuthenticated(),
  );

  const content = isAdminPath
    ? (!authed ? <AdminLogin onLogin={() => setAuthed(true)} /> : <AdminPanel onLogout={() => setAuthed(false)} />)
    : (!authed ? <Login onLogin={() => setAuthed(true)} /> : <OwnerApp onLogout={() => setAuthed(false)} />);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {content}
      </ToastProvider>
    </QueryClientProvider>
  );
}
