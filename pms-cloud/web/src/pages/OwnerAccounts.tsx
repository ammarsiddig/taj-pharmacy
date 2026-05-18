import { useEffect, useState } from 'react';
import { getOwnerAccounts, type OwnerAccount } from '../api';
import Icon from '../components/ui/Icon';
import Skeleton from '../components/ui/Skeleton';

function fmt(fils: number): string {
  return (fils / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props { branch: string; }

const providerLabels: Record<string, string> = {
  bok: 'بنك الخرطوم',
  fib: 'فيصل الإسلامي',
  onb: 'أم درمان الوطني',
  other: 'آخر',
};

export default function OwnerAccounts({ branch }: Props) {
  const [accounts, setAccounts] = useState<OwnerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'all' | 'cash' | 'bank'>('all');

  useEffect(() => {
    getOwnerAccounts(branch)
      .then(r => setAccounts(r.accounts))
      .catch(() => setError('تعذر تحميل الحسابات'))
      .finally(() => setLoading(false));
  }, [branch]);

  const filtered = tab === 'all' ? accounts : accounts.filter(a => a.account_type === tab);
  const totalCash = accounts.filter(a => a.account_type === 'cash').reduce((s, a) => s + a.current_balance, 0);
  const totalBank = accounts.filter(a => a.account_type === 'bank').reduce((s, a) => s + a.current_balance, 0);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, #1C5F6F 0%, #0FA3A6 100%)', color: 'white' }}>
        <p className="text-sm opacity-80">إجمالي الأصول</p>
        <p className="t-num mt-1">{fmt(totalCash + totalBank)} <span className="text-base font-normal opacity-50">SDG</span></p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="app-card p-4">
          <Icon name="banknotes" size={18} style={{ color: 'var(--color-status-success)' }} />
          <p className="text-xs mt-1" style={{ color: 'var(--color-ink-muted)' }}>النقدي</p>
          <p className="font-bold tabular-nums" style={{ color: 'var(--color-status-success)' }}>{fmt(totalCash)}</p>
        </div>
        <div className="app-card p-4">
          <Icon name="credit-card" size={18} style={{ color: 'var(--color-primary-600)' }} />
          <p className="text-xs mt-1" style={{ color: 'var(--color-ink-muted)' }}>البنكي</p>
          <p className="font-bold tabular-nums" style={{ color: 'var(--color-primary-600)' }}>{fmt(totalBank)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl p-1" style={{ background: 'var(--color-ivory-muted)' }}>
        {(['all', 'cash', 'bank'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-lg py-2 text-sm font-bold ${tab === t ? 'bg-white shadow-sm' : ''}`}
            style={{ color: tab === t ? 'var(--color-ink-main)' : 'var(--color-ink-muted)' }}>
            {t === 'all' ? 'الكل' : t === 'cash' ? 'نقدي' : 'بنكي'}
          </button>
        ))}
      </div>

      {loading && <div className="flex flex-col gap-3">{[...Array(4)].map((_, i) => <Skeleton key={i} height="64px" rounded="md" />)}</div>}
      {error && <p className="py-8 text-center text-sm" style={{ color: 'var(--color-status-danger)' }}>{error}</p>}

      {!loading && filtered.map(acc => (
        <div key={acc.id} className="app-card p-4 flex items-center gap-4">
          <div className="rounded-xl w-10 h-10 flex items-center justify-center" style={{ background: acc.account_type === 'cash' ? '#F0FDF4' : 'var(--color-primary-50)' }}>
            <Icon name={acc.account_type === 'cash' ? 'banknotes' : 'credit-card'} size={18} style={{ color: acc.account_type === 'cash' ? 'var(--color-status-success)' : 'var(--color-primary-600)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm truncate" style={{ color: 'var(--color-ink-main)' }}>{acc.name_ar || acc.name}</p>
              {acc.is_default === 1 && <span className="text-[10px] rounded-full px-2 py-0.5 font-bold" style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary-700)' }}>افتراضي</span>}
            </div>
            {acc.bank_provider && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-muted)' }}>
                {providerLabels[acc.bank_provider] || acc.bank_provider}
                {acc.phone_label && ` · ${acc.phone_label}`}
              </p>
            )}
            {acc.account_type === 'bank' && (acc.internal_fee > 0 || acc.external_fee > 0) && (
              <p className="text-[10px]" style={{ color: 'var(--color-ink-placeholder)' }}>
                رسوم: داخلي {fmt(acc.internal_fee)} · خارجي {fmt(acc.external_fee)}
              </p>
            )}
          </div>
          <div className="text-end shrink-0">
            <p className="font-bold tabular-nums" style={{ color: 'var(--color-ink-main)' }}>{fmt(acc.current_balance)}</p>
            <p className="text-[10px]" style={{ color: 'var(--color-ink-muted)' }}>SDG</p>
          </div>
        </div>
      ))}

      {!loading && filtered.length === 0 && (
        <div className="py-10 text-center">
          <Icon name="credit-card" size={40} style={{ color: 'var(--color-ink-placeholder)' }} />
          <p className="mt-2 font-medium" style={{ color: 'var(--color-ink-main)' }}>لا توجد حسابات</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-ink-muted)' }}>تتم المزامنة من تطبيق الصيدلية</p>
        </div>
      )}
    </div>
  );
}
