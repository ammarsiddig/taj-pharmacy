import { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { LicenseProvider, useLicense } from './hooks/useLicense';
import { AppModeProvider } from './hooks/useAppMode';
import { usePermissions } from './hooks/usePermissions';
import { Can } from './components/Can';
import { FEATURE_FLAGS } from './hooks/usePermission';
import PermissionsUpgradeBanner from './components/PermissionsUpgradeBanner';
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
import Accounts from './pages/Accounts';
import CustomerDetail from './pages/CustomerDetail';
import CustomerNew from './pages/CustomerNew';
import SupplierDetail from './pages/SupplierDetail';
import Reports from './pages/Reports';
import Warehouse from './pages/Warehouse';
import Sales from './pages/Sales';
import Onboarding from './pages/Onboarding';
import { checkOnboarding, syncAllTablesNow, initTenantId } from './api';
import { checkPendingUpdate } from './api';
import './i18n';

const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface SyncStatusCtx {
  syncError: boolean;
  setSyncError: (v: boolean) => void;
}
const SyncStatusContext = createContext<SyncStatusCtx>({
  syncError: false,
  setSyncError: () => {},
});
export function useSyncStatus() { return useContext(SyncStatusContext); }

function useAutoSync(enabled: boolean, setSyncError: (v: boolean) => void) {
  useEffect(() => {
    if (!enabled) return;
    const run = () => {
      syncAllTablesNow()
        .then(() => setSyncError(false))
        .catch(() => setSyncError(true));
    };
    run();
    const id = setInterval(run, AUTO_SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, setSyncError]);
}

function useUpdateCheck(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    checkPendingUpdate().catch(() => {});
    const id = setInterval(() => {
      checkPendingUpdate().catch(() => {});
    }, UPDATE_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled]);
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function UpgradeRequired() {
  const { t } = useTranslation();
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
        <h2 className="text-xl font-bold text-ink-main">{t('license.featureNotAvailable')}</h2>
        <p className="max-w-sm text-sm text-ink-muted">
          {t('license.featureNotAvailableDesc')}
        </p>
      </div>
      <button
        onClick={() => navigate('/settings', { state: { tab: 'license' } })}
        className="rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-primary-700 transition-colors"
      >
        {t('license.viewUpgradeOptions')}
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

function SettingsGate({ children }: { children: React.ReactNode }) {
  const { hasAny } = usePermissions();
  if (!hasAny(['settings.users', 'settings.branches', 'settings.license', 'settings.backup', 'settings.payment_methods', 'settings.tax'])) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function BlockedScreen() {
  const { t } = useTranslation();
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
        <h2 className="text-xl font-bold text-ink-main">{t('license.expired')}</h2>
        <p className="max-w-sm text-sm text-ink-muted">
          {t('license.expiredDesc')}
        </p>
      </div>
      <button
        onClick={() => navigate('/settings', { state: { tab: 'license' } })}
        className="rounded-xl bg-status-danger px-6 py-2.5 text-sm font-semibold text-white shadow hover:opacity-90 transition-opacity"
      >
        {t('license.renewButton')}
      </button>
    </div>
  );
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();
  const [syncError, setSyncError] = useState(false);
  useAutoSync(isAuthenticated, setSyncError);
  useUpdateCheck(isAuthenticated);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);

  useEffect(() => {
    initTenantId()
      .then(() => checkOnboarding())
      .then((status) => {
        setOnboardingCompleted(status.completed);
        setOnboardingChecked(true);
      })
      .catch(() => {
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
    <SyncStatusContext.Provider value={{ syncError, setSyncError }}>
      {isAuthenticated && <PermissionsUpgradeBanner />}
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
          <Route path="/products" element={<Can resource="products"><FeatureGate flag={FEATURE_FLAGS.PRODUCTS}><Products /></FeatureGate></Can>} />
          <Route path="/purchases" element={<Can resource="purchases"><FeatureGate flag={FEATURE_FLAGS.PURCHASES}><Purchases /></FeatureGate></Can>} />
          <Route path="/purchases/new" element={<Can resource="purchases"><FeatureGate flag={FEATURE_FLAGS.PURCHASES}><PurchaseNew /></FeatureGate></Can>} />
          <Route path="/purchases/:id/edit" element={<Can resource="purchases"><FeatureGate flag={FEATURE_FLAGS.PURCHASES}><PurchaseNew /></FeatureGate></Can>} />
          <Route path="/purchases/:id" element={<Can resource="purchases"><FeatureGate flag={FEATURE_FLAGS.PURCHASES}><PurchaseDetail /></FeatureGate></Can>} />
          <Route path="/pos" element={<FeatureGate flag={FEATURE_FLAGS.POS}><POS /></FeatureGate>} />
          <Route path="/expenses" element={<Can resource="expenses"><FeatureGate flag={FEATURE_FLAGS.EXPENSES}><Expenses /></FeatureGate></Can>} />
          <Route path="/accounts" element={<Can resource="accounts"><FeatureGate flag={FEATURE_FLAGS.ACCOUNTS}><Accounts /></FeatureGate></Can>} />
          <Route path="/customers/new" element={<Can resource="customers"><FeatureGate flag={FEATURE_FLAGS.CUSTOMERS}><CustomerNew /></FeatureGate></Can>} />
          <Route path="/customers/:id" element={<Can resource="customers"><FeatureGate flag={FEATURE_FLAGS.CUSTOMERS}><CustomerDetail /></FeatureGate></Can>} />
          <Route path="/suppliers/:id" element={<Can resource="suppliers"><FeatureGate flag={FEATURE_FLAGS.SUPPLIERS}><SupplierDetail /></FeatureGate></Can>} />
          <Route path="/reports" element={<Can resource="reports.sales"><FeatureGate flag={FEATURE_FLAGS.REPORTS}><Reports /></FeatureGate></Can>} />
          <Route path="/warehouse" element={<Can resource="inventory"><FeatureGate flag={FEATURE_FLAGS.WAREHOUSE}><Warehouse /></FeatureGate></Can>} />
          <Route path="/sales" element={<Can resource="reports.sales"><FeatureGate flag={FEATURE_FLAGS.SALES}><Sales /></FeatureGate></Can>} />
          <Route path="/settings" element={<SettingsGate><Settings /></SettingsGate>} />
        </Route>
        <Route path="*" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
      </Routes>
    </SyncStatusContext.Provider>
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
