import { useState, useCallback, useEffect } from 'react';
import { clearToken, getDashboard, getOwnerBranches, type DashboardData } from '../api';
import Home from './Home';
import Activity from './Activity';
import Stock from './Stock';
import Sync from './Sync';
import SalesList from './SalesList';
import Products from './Products';
import Balances from './Balances';
import SupplierAccounts from './SupplierAccounts';
import OwnerSettings from './OwnerSettings';

type Page = 'home' | 'sales' | 'products' | 'stock' | 'balances' | 'supplier_accounts' | 'activity' | 'sync' | 'settings';

interface OwnerAppProps {
  onLogout: () => void;
}

// Desktop shows all nav items, mobile shows first 5 (home, sales, products, activity, settings)
const NAV_ITEMS: { id: Page; label: string; icon: string; mobile?: boolean }[] = [
  { id: 'home',     label: 'الرئيسية', icon: 'home',     mobile: true },
  { id: 'sales',    label: 'المبيعات', icon: 'receipt',  mobile: true },
  { id: 'products', label: 'المنتجات', icon: 'pills',    mobile: true },
  { id: 'stock',    label: 'المخزون',  icon: 'package',  mobile: false },
  { id: 'balances', label: 'الأرصدة',  icon: 'coins',    mobile: false },
  { id: 'supplier_accounts', label: 'الموردين', icon: 'truck', mobile: false },
  { id: 'activity', label: 'النشاط',   icon: 'activity', mobile: true },
  { id: 'sync',     label: 'المزامنة', icon: 'sync',     mobile: false },
  { id: 'settings', label: 'الإعدادات', icon: 'settings', mobile: true },
];

function NavIcon({ name }: { name: string }) {
  const props = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'home':     return <svg {...props}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
    case 'activity': return <svg {...props}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
    case 'package':  return <svg {...props}><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
    case 'coins':    return <svg {...props}><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>;
    case 'sync':     return <svg {...props}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;
    case 'receipt':  return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
    case 'pills':    return <svg {...props}><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>;
    case 'truck':    return <svg {...props}><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
    case 'settings': return <svg {...props}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>;
    default:         return null;
  }
}

export default function OwnerApp({ onLogout }: OwnerAppProps) {
  const [page, setPage] = useState<Page>('home');
  const [data, setData] = useState<DashboardData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [branches, setBranches] = useState<string[]>(['main-branch']);
  const [selectedBranch, setSelectedBranch] = useState('main-branch');

  const handleLogout = () => {
    clearToken();
    onLogout();
  };

  const handleRefresh = useCallback(async () => {
    try {
      const fresh = await getDashboard(selectedBranch);
      setData(fresh);
      setRefreshKey((k) => k + 1);
    } catch { /* page-level error handling */ }
  }, [selectedBranch]);

  useEffect(() => {
    getOwnerBranches()
      .then((res) => {
        const list = res.branches.length > 0 ? res.branches : ['main-branch'];
        setBranches(list);
        setSelectedBranch((current) => list.includes(current) ? current : list[0]);
      })
      .catch(() => setBranches(['main-branch']));
  }, []);

  const pharmacyName = data?.dashboard?.pharmacy_name || 'لوحة المالك';
  const branchSelector = branches.length > 1 && (
    <select
      value={selectedBranch}
      onChange={(e) => setSelectedBranch(e.target.value)}
      className="rounded-xl border px-3 py-2 text-sm font-medium outline-none"
      style={{ background: 'var(--color-ivory-surface)', borderColor: 'var(--color-ivory-border)', color: 'var(--color-ink-main)' }}
      dir="ltr"
    >
      {branches.map((branch) => (
        <option key={branch} value={branch}>{branch}</option>
      ))}
    </select>
  );

  return (
    <div className="flex h-dvh overflow-hidden" style={{ background: 'var(--color-ivory-app)' }}>

      {/* ── DESKTOP: Left sidebar ── */}
      <aside
        className="hidden md:flex flex-col"
        style={{
          width: '220px',
          height: '100dvh',
          background: '#1C5F6F',
          position: 'sticky',
          top: 0,
          flexShrink: 0,
          overflowY: 'auto',
        }}
      >
        {/* Brand */}
        <div className="px-5 py-6">
          <p className="text-white font-black text-lg leading-tight">{pharmacyName}</p>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>لوحة المالك</p>
        </div>

        {/* Nav items */}
        <nav className="flex flex-col gap-1 px-3 flex-1">
          {NAV_ITEMS.map((item) => {
            const active = page === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-start w-full"
                style={{
                  background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: active ? 'white' : 'rgba(255,255,255,0.65)',
                }}
              >
                <NavIcon name={item.icon} />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="p-3 flex flex-col gap-1">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 w-full"
            style={{ color: 'rgba(255,255,255,0.65)', background: 'transparent' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            <span className="text-sm font-medium">تحديث</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 w-full"
            style={{ color: 'rgba(255,255,255,0.65)', background: 'transparent' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span className="text-sm font-medium">خروج</span>
          </button>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex flex-1 flex-col min-w-0 h-full overflow-hidden">

        {/* Mobile-only top header */}
        <header
          className="md:hidden sticky top-0 z-20 flex items-center justify-between px-4 py-3"
          style={{
            background: '#1C5F6F',
            color: 'white',
            boxShadow: '0 10px 25px -16px rgb(15 23 42 / 0.22)',
          }}
        >
          <button
            onClick={handleLogout}
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: 'rgba(255,255,255,0.12)' }}
            aria-label="خروج"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
          <span className="min-w-0 truncate text-base font-bold">{pharmacyName}</span>
          <button
            onClick={handleRefresh}
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: 'rgba(255,255,255,0.12)' }}
            aria-label="تحديث"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
        </header>

        {/* Desktop page title bar */}
        <div
          className="hidden md:flex items-center justify-between px-8 py-4"
          style={{ borderBottom: '1px solid var(--color-ivory-border)', background: 'var(--color-ivory-surface)' }}
        >
          <h1 className="text-xl font-black" style={{ color: 'var(--color-ink-main)' }}>
            {NAV_ITEMS.find(n => n.id === page)?.label ?? 'الرئيسية'}
          </h1>
          <span className="text-sm" style={{ color: 'var(--color-ink-muted)' }}>
            {pharmacyName}
          </span>
          {branchSelector}
        </div>

        {branches.length > 1 && (
          <div className="md:hidden px-4 py-3" style={{ borderBottom: '1px solid var(--color-ivory-border)' }}>
            {branchSelector}
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 min-h-0 overflow-y-auto pb-24 md:pb-8">
          <div className="md:max-w-3xl md:mx-auto">
            {page === 'home'     && <Home key={`${refreshKey}-${selectedBranch}`} branch={selectedBranch} onDataLoad={setData} onNavigate={(p) => setPage(p as Page)} />}
            {page === 'sales'    && <SalesList key={`${refreshKey}-${selectedBranch}`} branch={selectedBranch} />}
            {page === 'products' && <Products key={`${refreshKey}-${selectedBranch}`} branch={selectedBranch} />}
            {page === 'stock'    && <Stock key={`${refreshKey}-${selectedBranch}`} dashboard={data} />}
            {page === 'balances' && <Balances key={`${refreshKey}-${selectedBranch}`} branch={selectedBranch} />}
            {page === 'supplier_accounts' && <SupplierAccounts key={`${refreshKey}-${selectedBranch}`} branch={selectedBranch} />}
            {page === 'activity' && <Activity key={`${refreshKey}-${selectedBranch}`} branch={selectedBranch} />}
            {page === 'sync'     && <Sync key={refreshKey} />}
            {page === 'settings' && <OwnerSettings onLogout={onLogout} />}
          </div>
        </main>

        {/* Mobile-only bottom navigation - 5 items only */}
        <nav
          className="bottom-nav md:hidden fixed bottom-0 inset-x-0 z-20 flex items-stretch"
          style={{
            background: 'var(--color-ivory-surface)',
            borderTop: '1px solid var(--color-ivory-border)',
            boxShadow: '0 -4px 16px -4px rgb(15 23 42 / 0.10)',
          }}
        >
          {NAV_ITEMS.filter(i => i.mobile !== false).map((item) => {
            const active = page === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2"
                style={{
                  color: active ? 'var(--color-primary-600)' : 'var(--color-ink-muted)',
                  minHeight: '56px',
                }}
              >
                {active && (
                  <span
                    className="pointer-events-none absolute top-0 inset-x-3 h-0.5 rounded-full"
                    style={{ background: 'var(--color-primary-600)' }}
                  />
                )}
                <span style={{ opacity: active ? 1 : 0.6 }}>
                  <NavIcon name={item.icon} />
                </span>
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
