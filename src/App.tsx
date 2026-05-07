import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { LicenseProvider, useLicense } from './hooks/useLicense';
import { AppModeProvider } from './hooks/useAppMode';
import { FEATURE_FLAGS } from './hooks/usePermission';
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Settings from './pages/Settings';
import Purchases from './pages/Purchases';
import PurchaseDetail from './pages/PurchaseDetail';
import PurchaseNew from './pages/PurchaseNew';
import POS from './pages/POS';
import Expenses from './pages/Expenses';
import CustomerDetail from './pages/CustomerDetail';
import SupplierDetail from './pages/SupplierDetail';
import Reports from './pages/Reports';
import Warehouse from './pages/Warehouse';
import Sales from './pages/Sales';
import Onboarding from './pages/Onboarding';
import { checkOnboarding, syncAllTablesNow } from './api';
import './i18n';

const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function useAutoSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const run = () => syncAllTablesNow().catch(() => { /* silent */ });
    run();
    const id = setInterval(run, AUTO_SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled]);
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function UpgradeRequired() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-500">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold text-ink-main">Feature Not Available</h2>
        <p className="max-w-sm text-sm text-ink-muted">
          This feature is not included in your current subscription plan.
          Upgrade your license to unlock access.
        </p>
      </div>
      <button
        onClick={() => navigate('/settings', { state: { tab: 'license' } })}
        className="rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-primary-700 transition-colors"
      >
        View Upgrade Options
      </button>
    </div>
  );
}

function FeatureGate({ flag, children }: { flag: number; children: React.ReactNode }) {
  const { hasFeature, isBlocked } = useLicense();
  if (isBlocked) return <BlockedScreen />;
  if (!hasFeature(flag)) return <UpgradeRequired />;
  return <>{children}</>;
}

function BlockedScreen() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-status-danger">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
      </div>
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold text-ink-main">License Expired</h2>
        <p className="max-w-sm text-sm text-ink-muted">
          Your license has expired. The system is in read-only mode.
          Renew your license to restore full access.
        </p>
      </div>
      <button
        onClick={() => navigate('/settings', { state: { tab: 'license' } })}
        className="rounded-xl bg-status-danger px-6 py-2.5 text-sm font-semibold text-white shadow hover:opacity-90 transition-opacity"
      >
        Renew License
      </button>
    </div>
  );
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();
  useAutoSync(isAuthenticated);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);

  useEffect(() => {
    checkOnboarding()
      .then((status) => {
        setOnboardingCompleted(status.completed);
        setOnboardingChecked(true);
      })
      .catch(() => {
        // Fail open — if we can't check, proceed to normal app
        setOnboardingChecked(true);
      });
  }, []);

  if (!onboardingChecked) {
    return (
      <div className="min-h-screen bg-ivory-app flex items-center justify-center">
        <div className="text-ink-muted text-sm">جاري التحميل...</div>
      </div>
    );
  }

  if (!onboardingCompleted) {
    return <Onboarding onComplete={() => setOnboardingCompleted(true)} />;
  }

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/products" element={<FeatureGate flag={FEATURE_FLAGS.PRODUCTS}><Products /></FeatureGate>} />
        <Route path="/purchases" element={<FeatureGate flag={FEATURE_FLAGS.PURCHASES}><Purchases /></FeatureGate>} />
        <Route path="/purchases/new" element={<FeatureGate flag={FEATURE_FLAGS.PURCHASES}><PurchaseNew /></FeatureGate>} />
        <Route path="/purchases/:id/edit" element={<FeatureGate flag={FEATURE_FLAGS.PURCHASES}><PurchaseNew /></FeatureGate>} />
        <Route path="/purchases/:id" element={<FeatureGate flag={FEATURE_FLAGS.PURCHASES}><PurchaseDetail /></FeatureGate>} />
        <Route path="/pos" element={<FeatureGate flag={FEATURE_FLAGS.POS}><POS /></FeatureGate>} />
        <Route path="/expenses" element={<FeatureGate flag={FEATURE_FLAGS.EXPENSES}><Expenses /></FeatureGate>} />
        <Route path="/customers/:id" element={<FeatureGate flag={FEATURE_FLAGS.CUSTOMERS}><CustomerDetail /></FeatureGate>} />
        <Route path="/suppliers/:id" element={<FeatureGate flag={FEATURE_FLAGS.SUPPLIERS}><SupplierDetail /></FeatureGate>} />
        <Route path="/reports" element={<FeatureGate flag={FEATURE_FLAGS.REPORTS}><Reports /></FeatureGate>} />
        <Route path="/warehouse" element={<FeatureGate flag={FEATURE_FLAGS.WAREHOUSE}><Warehouse /></FeatureGate>} />
        <Route path="/sales" element={<FeatureGate flag={FEATURE_FLAGS.SALES}><Sales /></FeatureGate>} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LicenseProvider>
          <AppModeProvider>
            <AppRoutes />
          </AppModeProvider>
        </LicenseProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
