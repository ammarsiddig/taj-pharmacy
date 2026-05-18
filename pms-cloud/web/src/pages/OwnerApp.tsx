import { useState, useCallback, useEffect } from 'react';
import { clearToken, getDashboard, getOwnerBranches, setBranchName, type DashboardData } from '../api';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import InstallBanner from '../components/InstallBanner';
import Icon from '../components/ui/Icon';
import Home from './Home';
import Activity from './Activity';
import Stock from './Stock';
import Sync from './Sync';
import SalesList from './SalesList';
import Products from './Products';
import Balances from './Balances';
import SupplierAccounts from './SupplierAccounts';
import OwnerSettings from './OwnerSettings';
import Backups from './Backups';
import OwnerAccounts from './OwnerAccounts';

type Page = 'home' | 'sales' | 'products' | 'stock' | 'balances' | 'supplier_accounts' | 'accounts' | 'activity' | 'sync' | 'settings' | 'backups';

interface OwnerAppProps { onLogout: () => void; }

const NAV_ITEMS: { id: Page; label: string; icon: string; mobile?: boolean }[] = [
  { id: 'home', label: 'الرئيسية', icon: 'home', mobile: true },
  { id: 'sales', label: 'المبيعات', icon: 'receipt', mobile: true },
  { id: 'products', label: 'المنتجات', icon: 'package', mobile: true },
  { id: 'stock', label: 'المخزون', icon: 'chart-bar', mobile: true },
  { id: 'balances', label: 'الأرصدة', icon: 'credit-card', mobile: true },
  { id: 'accounts', label: 'الحسابات', icon: 'banknotes', mobile: true },
  { id: 'supplier_accounts', label: 'الموردين', icon: 'user-group', mobile: true },
  { id: 'activity', label: 'النشاط', icon: 'clock', mobile: true },
  { id: 'sync', label: 'المزامنة', icon: 'sync', mobile: true },
  { id: 'backups', label: 'النسخ الاحتياطي', icon: 'database', mobile: true },
  { id: 'settings', label: 'الإعدادات', icon: 'settings', mobile: true },
];

interface BranchInfo { id: string; name: string | null; }

export default function OwnerApp({ onLogout }: OwnerAppProps) {
  const [page, setPage] = useState<Page>('home');
  const [data, setData] = useState<DashboardData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [branches, setBranches] = useState<BranchInfo[]>([{ id: 'main-branch', name: null }]);
  const [selectedBranch, setSelectedBranch] = useState('main-branch');
  const { canInstall, isIOS, install } = useInstallPrompt();

  const handleLogout = () => { clearToken(); onLogout(); };

  const handleRefresh = useCallback(async () => {
    try {
      const fresh = await getDashboard(selectedBranch);
      setData(fresh);
      setRefreshKey(k => k + 1);
    } catch {}
  }, [selectedBranch]);

  useEffect(() => {
    getOwnerBranches().then(res => {
      const list: BranchInfo[] = res.branches.length > 0 ? res.branches : [{ id: 'main-branch', name: null }];
      setBranches(list);
      setSelectedBranch(current => list.some(b => b.id === current) ? current : (list[0]?.id || 'main-branch'));
    }).catch(() => setBranches([{ id: 'main-branch', name: null }]));
  }, []);

  const handleRenameBranch = async (branchId: string) => {
    const branch = branches.find(b => b.id === branchId);
    const newName = prompt('اسم الفرع:', branch?.name || '');
    if (!newName?.trim() || newName.trim() === (branch?.name || '')) return;
    try {
      await setBranchName(branchId, newName.trim());
      setBranches(prev => prev.map(b => b.id === branchId ? { ...b, name: newName.trim() } : b));
    } catch { alert('فشل حفظ اسم الفرع'); }
  };

  const pharmacyName = data?.dashboard?.pharmacy_name || 'لوحة المالك';
  const branchSelector = branches.length > 1 && (
    <div className="flex items-center gap-1">
      <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}
        className="rounded-xl border px-3 py-2 text-sm font-medium outline-none" dir="ltr"
        style={{ background: 'var(--color-ivory-surface)', borderColor: 'var(--color-ivory-border)', color: 'var(--color-ink-main)' }}>
        {branches.map(b => <option key={b.id} value={b.id}>{b.name || b.id}</option>)}
      </select>
      <button onClick={() => handleRenameBranch(selectedBranch)}
        className="rounded-xl border px-2 py-2 text-xs" style={{ borderColor: 'var(--color-ivory-border)', color: 'var(--color-ink-muted)' }}
        title="تغيير اسم الفرع"><Icon name="pencil" size={14} /></button>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden" style={{ background: 'var(--color-ivory-app)' }}>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col" style={{ width: '220px', height: '100dvh', background: '#1C5F6F', position: 'sticky', top: 0, flexShrink: 0, overflowY: 'auto' }}>
        <div className="flex items-center gap-3 px-5 py-6">
          <img src="/taj-logo-mark-reversed.svg" alt="TAJ Pharmacy" className="h-10 w-10 shrink-0 object-contain" />
          <div className="min-w-0">
            <p className="text-white font-black text-lg leading-tight truncate">{pharmacyName}</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>لوحة المالك</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1 px-3 flex-1">
          {NAV_ITEMS.map(item => {
            const active = page === item.id;
            return (
              <button key={item.id} onClick={() => setPage(item.id)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-start w-full"
                style={{ background: active ? 'rgba(255,255,255,0.15)' : 'transparent', color: active ? 'white' : 'rgba(255,255,255,0.65)' }}>
                <Icon name={item.icon} size={20} />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="p-3 flex flex-col gap-1">
          <button onClick={handleRefresh} className="flex items-center gap-3 rounded-xl px-3 py-2.5 w-full" style={{ color: 'rgba(255,255,255,0.65)' }}>
            <Icon name="refresh" size={20} /> <span className="text-sm font-medium">تحديث</span>
          </button>
          <button onClick={handleLogout} className="flex items-center gap-3 rounded-xl px-3 py-2.5 w-full" style={{ color: 'rgba(255,255,255,0.65)' }}>
            <Icon name="logout" size={20} /> <span className="text-sm font-medium">خروج</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0 h-full overflow-hidden">
        {/* Mobile glass header */}
        <header className="md:hidden sticky top-0 z-20 flex items-center justify-between px-4 py-3 safe-pt" style={{ background: 'rgba(28,95,111,0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', color: 'white' }}>
          <button onClick={handleLogout} className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'rgba(255,255,255,0.12)' }} aria-label="خروج">
            <Icon name="logout" size={18} />
          </button>
          <span className="min-w-0 truncate text-base font-bold">{pharmacyName}</span>
          <button onClick={handleRefresh} className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'rgba(255,255,255,0.12)' }} aria-label="تحديث">
            <Icon name="refresh" size={18} />
          </button>
        </header>

        <div className="hidden md:flex items-center justify-between px-8 py-4" style={{ borderBottom: '1px solid var(--color-ivory-border)', background: 'var(--color-ivory-surface)' }}>
          <h1 className="text-xl font-black" style={{ color: 'var(--color-ink-main)' }}>{NAV_ITEMS.find(n => n.id === page)?.label ?? 'الرئيسية'}</h1>
          <span className="text-sm" style={{ color: 'var(--color-ink-muted)' }}>{pharmacyName}</span>
        </div>

        {branches.length > 1 && (
          <div className="md:hidden px-4 py-3" style={{ borderBottom: '1px solid var(--color-ivory-border)' }}>{branchSelector}</div>
        )}

        <main className="flex-1 min-h-0 overflow-y-auto pb-24 md:pb-8">
          <div className="md:max-w-3xl md:mx-auto">
            {page === 'home' && <Home key={`${refreshKey}-${selectedBranch}`} branch={selectedBranch} onDataLoad={setData} onNavigate={p => setPage(p as Page)} />}
            {page === 'sales' && <SalesList key={`${refreshKey}-${selectedBranch}`} branch={selectedBranch} />}
            {page === 'products' && <Products key={`${refreshKey}-${selectedBranch}`} branch={selectedBranch} />}
            {page === 'stock' && <Stock key={`${refreshKey}-${selectedBranch}`} dashboard={data} />}
            {page === 'balances' && <Balances key={`${refreshKey}-${selectedBranch}`} branch={selectedBranch} />}
            {page === 'supplier_accounts' && <SupplierAccounts key={`${refreshKey}-${selectedBranch}`} branch={selectedBranch} />}
            {page === 'accounts' && <OwnerAccounts key={`${refreshKey}-${selectedBranch}`} branch={selectedBranch} />}
            {page === 'activity' && <Activity key={`${refreshKey}-${selectedBranch}`} branch={selectedBranch} />}
            {page === 'sync' && <Sync key={`${refreshKey}-${selectedBranch}`} branch={selectedBranch} />}
            {page === 'backups' && <Backups key={refreshKey} />}
            {page === 'settings' && <OwnerSettings onLogout={onLogout} />}
          </div>
        </main>

        <InstallBanner canInstall={canInstall} isIOS={isIOS} onInstall={install} />

        {/* Pill bottom nav */}
        <nav className="bottom-nav md:hidden fixed bottom-0 inset-x-0 z-20 flex items-stretch justify-center gap-1 px-2 py-2 safe-pb" style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(244,251,251,0.95) 20%, var(--color-ivory-surface) 100%)' }}>
          <div className="flex items-stretch gap-0.5 rounded-2xl p-1" style={{ background: 'var(--color-ivory-surface)', border: '1px solid var(--color-ivory-border)', boxShadow: '0 -4px 16px -4px rgb(15 23 42 / 0.10)' }}>
            {NAV_ITEMS.filter(i => i.mobile !== false).map(item => {
              const active = page === item.id;
              return (
                <button key={item.id} onClick={() => setPage(item.id)}
                  className="relative flex flex-col items-center justify-center gap-0.5 px-4 py-1.5 rounded-xl transition-colors"
                  style={{
                    background: active ? 'var(--color-primary-600)' : 'transparent',
                    color: active ? 'white' : 'var(--color-ink-muted)',
                    minHeight: '48px',
                  }}>
                  <Icon name={item.icon} size={18} />
                  <span className="text-[10px] font-medium leading-none">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
