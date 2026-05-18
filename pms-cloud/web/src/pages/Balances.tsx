import { useEffect, useState } from 'react';
import { getOwnerBalances, type BalanceEntry } from '../api';
import Icon from '../components/ui/Icon';
import Skeleton from '../components/ui/Skeleton';

function fmt(fils: number): string {
  return (fils / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props { branch: string; }

export default function Balances({ branch }: Props) {
  const [customers, setCustomers] = useState<BalanceEntry[]>([]);
  const [suppliers, setSuppliers] = useState<BalanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'customers' | 'suppliers'>('customers');

  useEffect(() => {
    getOwnerBalances(branch)
      .then(r => { setCustomers(r.customers); setSuppliers(r.suppliers); })
      .catch(() => setError('تعذر تحميل الأرصدة'))
      .finally(() => setLoading(false));
  }, [branch]);

  const totalReceivables = customers.reduce((s, c) => s + c.current_balance, 0);
  const totalPayables = suppliers.reduce((s, c) => s + c.current_balance, 0);
  const netPosition = totalReceivables - totalPayables;
  const list = tab === 'customers' ? customers : suppliers;

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Net position hero */}
      <div className="rounded-2xl p-5" style={{ background: netPosition >= 0 ? 'linear-gradient(135deg, #0D8B8D 0%, #0FA3A6 100%)' : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)', color: 'white' }}>
        <p className="text-sm opacity-80">صافي المركز المالي</p>
        <p className="t-num mt-1">{fmt(Math.abs(netPosition))} <span className="text-base font-normal opacity-50">SDG</span></p>
        <p className="mt-1 text-xs opacity-70">{netPosition >= 0 ? 'صافي مستحق لك' : 'صافي مستحق عليك'}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="app-card p-4">
          <Icon name="user-plus" size={18} style={{ color: 'var(--color-status-success)' }} />
          <p className="text-xs mt-1" style={{ color: 'var(--color-ink-muted)' }}>مستحق من العملاء</p>
          <p className="mt-1 text-lg font-black tabular-nums" style={{ color: 'var(--color-status-success)' }}>{fmt(totalReceivables)}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-muted)' }}>{customers.length} عميل</p>
        </div>
        <div className="app-card p-4">
          <Icon name="user-group" size={18} style={{ color: 'var(--color-status-danger)' }} />
          <p className="text-xs mt-1" style={{ color: 'var(--color-ink-muted)' }}>مستحق للموردين</p>
          <p className="mt-1 text-lg font-black tabular-nums" style={{ color: 'var(--color-status-danger)' }}>{fmt(totalPayables)}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-muted)' }}>{suppliers.length} مورد</p>
        </div>
      </div>

      {/* Tab switch */}
      <div className="flex rounded-xl p-1" style={{ background: 'var(--color-ivory-muted)' }}>
        {(['customers', 'suppliers'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-bold transition-colors ${tab === t ? 'bg-white shadow-sm text-ink-main' : ''}`}
            style={{ color: tab === t ? 'var(--color-ink-main)' : 'var(--color-ink-muted)' }}>
            {t === 'customers' ? `العملاء (${customers.length})` : `الموردون (${suppliers.length})`}
          </button>
        ))}
      </div>

      {error && <p className="py-8 text-center text-sm" style={{ color: 'var(--color-status-danger)' }}>{error}</p>}

      {loading && <div className="flex flex-col gap-3">{[...Array(5)].map((_, i) => <Skeleton key={i} height="60px" rounded="md" />)}</div>}

      {!loading && list.length === 0 && (
        <div className="py-10 text-center">
          <Icon name={tab === 'customers' ? 'user' : 'user-group'} size={40} style={{ color: 'var(--color-ink-placeholder)' }} />
          <p className="mt-2 font-medium" style={{ color: 'var(--color-ink-main)' }}>لا توجد أرصدة</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {list.map(entry => (
          <div key={entry.id} className="app-card flex items-center gap-4 p-4">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate" style={{ color: 'var(--color-ink-main)' }}>{entry.name}</p>
              {entry.phone && <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-muted)' }}>{entry.phone}</p>}
            </div>
            <p className="font-bold tabular-nums shrink-0" style={{ color: tab === 'customers' ? 'var(--color-status-success)' : 'var(--color-status-danger)' }}>
              {fmt(entry.current_balance)} SDG
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
