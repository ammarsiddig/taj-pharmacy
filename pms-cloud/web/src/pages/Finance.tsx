import { type DashboardData } from '../api';

interface FinanceProps {
  dashboard: DashboardData | null;
}

function fmt(fils: number): string {
  return (fils / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Finance({ dashboard }: FinanceProps) {
  const d = dashboard?.dashboard;
  const receivables = d?.total_receivables ?? 0;
  const payables    = d?.total_payables    ?? 0;
  const net         = receivables - payables;
  const netPositive = net >= 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--color-ink-main)' }}>الوضع المالي</h2>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--color-ink-muted)' }}>
          البيانات من آخر مزامنة مع التطبيق
        </p>
      </div>

      {!d ? (
        <div className="py-16 text-center">
          <p className="text-5xl">💰</p>
          <p className="mt-3 font-semibold" style={{ color: 'var(--color-ink-main)' }}>لا توجد بيانات</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-ink-muted)' }}>
            قم بالمزامنة من تطبيق الصيدلية أولاً
          </p>
        </div>
      ) : (
        <>
          {/* Receivables card */}
          <div className="app-card overflow-hidden">
            <div className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-xl" style={{ background: '#EFF6FF' }}>
                  📥
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--color-ink-muted)' }}>ذمم العملاء</p>
                  <p className="text-xs" style={{ color: 'var(--color-ink-placeholder)' }}>مبالغ مستحقة للصيدلية</p>
                </div>
              </div>
              <p className="mt-4 text-3xl font-black tabular-nums" style={{ color: '#1D4ED8' }}>
                {fmt(receivables)}
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--color-ink-muted)' }}>SDG</p>
            </div>
            <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #1D4ED8, #EFF6FF)' }} />
          </div>

          {/* Payables card */}
          <div className="app-card overflow-hidden">
            <div className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-xl" style={{ background: 'var(--color-status-danger-bg)' }}>
                  📤
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--color-ink-muted)' }}>ذمم الموردين</p>
                  <p className="text-xs" style={{ color: 'var(--color-ink-placeholder)' }}>مبالغ مستحقة على الصيدلية</p>
                </div>
              </div>
              <p className="mt-4 text-3xl font-black tabular-nums" style={{ color: 'var(--color-status-danger)' }}>
                {fmt(payables)}
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--color-ink-muted)' }}>SDG</p>
            </div>
            <div className="h-1.5" style={{ background: `linear-gradient(90deg, var(--color-status-danger), var(--color-status-danger-bg))` }} />
          </div>

          {/* Net position */}
          <div
            className="rounded-2xl p-5"
            style={{
              background: netPositive ? 'var(--color-status-success-bg)' : 'var(--color-status-danger-bg)',
              border: `1px solid ${netPositive ? '#6EE7B7' : '#FECACA'}`,
            }}
          >
            <p className="text-sm font-medium" style={{ color: netPositive ? 'var(--color-status-success)' : 'var(--color-status-danger)' }}>
              {netPositive ? '✅ صافي المستحقات (لصالحك)' : '⚠️ صافي الالتزامات (عليك)'}
            </p>
            <p
              className="mt-2 text-3xl font-black tabular-nums"
              style={{ color: netPositive ? 'var(--color-status-success)' : 'var(--color-status-danger)' }}
            >
              {fmt(Math.abs(net))} <span className="text-lg font-normal">SDG</span>
            </p>
            <p className="mt-1 text-xs" style={{ color: netPositive ? '#059669' : '#DC2626', opacity: 0.75 }}>
              ذمم العملاء − ذمم الموردين
            </p>
          </div>
        </>
      )}
    </div>
  );
}
