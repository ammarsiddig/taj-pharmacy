import { type DashboardData } from '../api';
import Icon from '../components/ui/Icon';

interface Props { dashboard: DashboardData | null; }

function ProgressRing({ pct, color, size = 48, strokeWidth = 4 }: { pct: number; color: string; size?: number; strokeWidth?: number }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-ivory-border)" strokeWidth={strokeWidth} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round">
        <animate attributeName="stroke-dashoffset" from={String(circ)} to={String(offset)} dur="0.8s" fill="freeze" />
      </circle>
    </svg>
  );
}

export default function Stock({ dashboard }: Props) {
  const d = dashboard?.dashboard;
  const total = d ? d.products_count || 1 : 1;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--color-ink-main)' }}>تنبيهات المخزون</h2>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--color-ink-muted)' }}>البيانات من آخر مزامنة</p>
      </div>

      {!d ? (
        <div className="py-16 text-center">
          <Icon name="package" size={48} style={{ color: 'var(--color-ink-placeholder)' }} />
          <p className="mt-3 font-semibold" style={{ color: 'var(--color-ink-main)' }}>لا توجد بيانات</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-ink-muted)' }}>قم بالمزامنة من تطبيق الصيدلية أولاً</p>
        </div>
      ) : (
        <>
          {/* Alert Cards with progress rings */}
          <div className="flex flex-col gap-3">
            {[
              { icon: 'x-circle', label: 'نفد المخزون', count: d.out_of_stock_count, color: 'var(--color-status-danger)', bg: 'var(--color-status-danger-bg)' },
              { icon: 'exclamation', label: 'مخزون منخفض', count: d.low_stock_count, color: 'var(--color-status-warning)', bg: 'var(--color-status-warning-bg)' },
              { icon: 'clock', label: 'قارب الانتهاء', count: d.expiring_soon_count, color: '#C2410C', bg: '#FFF7ED' },
            ].map(item => (
              <div key={item.label} className="app-card p-4 flex items-center gap-4">
                <ProgressRing pct={Math.min(1, item.count / total)} color={item.color} size={48} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Icon name={item.icon} size={16} style={{ color: item.color }} />
                    <p className="text-sm font-medium" style={{ color: 'var(--color-ink-main)' }}>{item.label}</p>
                  </div>
                  <p className="t-num mt-1" style={{ color: item.color }}>{item.count}</p>
                  <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>
                    {Math.round((item.count / total) * 100)}% من إجمالي {total} منتج
                  </p>
                </div>
              </div>
            ))}
          </div>

          {d.out_of_stock_count === 0 && d.low_stock_count === 0 && d.expiring_soon_count === 0 && (
            <div className="rounded-2xl p-6 text-center" style={{ background: 'var(--color-status-success-bg)' }}>
              <Icon name="check-circle" size={40} style={{ color: 'var(--color-status-success)' }} />
              <p className="mt-2 font-bold" style={{ color: 'var(--color-status-success)' }}>المخزون بحالة ممتازة!</p>
              <p className="mt-1 text-sm" style={{ color: 'var(--color-status-success)' }}>لا توجد تنبيهات</p>
            </div>
          )}

          <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-secondary)', border: '1px solid var(--color-ivory-border)' }}>
            <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>
              <Icon name="information-circle" size={14} className="inline" style={{ color: 'var(--color-ink-muted)' }} /> لعرض قائمة المنتجات التفصيلية، افتح تطبيق الصيدلية على الحاسب.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
