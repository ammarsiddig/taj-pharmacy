import { useState } from 'react';
import { isAuthenticated, isAdminAuthenticated } from './api';
import Login from './pages/Login';
import AdminLogin from './pages/AdminLogin';
import AdminPanel from './pages/AdminPanel';
import OwnerApp from './pages/OwnerApp';

const isAdminPath = window.location.pathname.startsWith('/mgmt');

export default function App() {
  const [authed, setAuthed] = useState(
    isAdminPath ? isAdminAuthenticated() : isAuthenticated(),
  );

  if (isAdminPath) {
    if (!authed) return <AdminLogin onLogin={() => setAuthed(true)} />;
    return <AdminPanel onLogout={() => setAuthed(false)} />;
  }

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;
  return <OwnerApp onLogout={() => setAuthed(false)} />;
}
