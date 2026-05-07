import { type DashboardData } from '../api';

interface StockProps {
  dashboard: DashboardData | null;
}

interface AlertCardProps {
  emoji: string;
  label: string;
  count: number;
  accentBg: string;
  accentColor: string;
  description: string;
}

function AlertCard({ emoji, label, count, accentBg, accentColor, description }: AlertCardProps) {
  return (
    <div className="app-card overflow-hidden">
      <div className="flex items-center gap-4 p-5">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl"
          style={{ background: accentBg }}
        >
          {emoji}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium" style={{ color: 'var(--color-ink-muted)' }}>{label}</p>
          <p className="mt-0.5 text-4xl font-black tabular-nums" style={{ color: accentColor }}>
            {count}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--color-ink-muted)' }}>{description}</p>
        </div>
      </div>
      {count > 0 && (
        <div
          className="h-1.5 w-full"
          style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentBg})` }}
        />
      )}
    </div>
  );
}

export default function Stock({ dashboard }: StockProps) {
  const d = dashboard?.dashboard;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--color-ink-main)' }}>تنبيهات المخزون</h2>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--color-ink-muted)' }}>
          البيانات من آخر مزامنة مع التطبيق
        </p>
      </div>

      {!d ? (
        <div className="py-16 text-center">
          <p className="text-5xl">📦</p>
          <p className="mt-3 font-semibold" style={{ color: 'var(--color-ink-main)' }}>لا توجد بيانات</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-ink-muted)' }}>
            قم بالمزامنة من تطبيق الصيدلية أولاً
          </p>
        </div>
      ) : (
        <>
          <AlertCard
            emoji="🔴"
            label="نفد المخزون"
            count={d.out_of_stock_count}
            accentBg="var(--color-status-danger-bg)"
            accentColor="var(--color-status-danger)"
            description="منتجات لا يوجد لها مخزون حالياً"
          />
          <AlertCard
            emoji="🟡"
            label="مخزون منخفض"
            count={d.low_stock_count}
            accentBg="var(--color-status-warning-bg)"
            accentColor="var(--color-status-warning)"
            description="منتجات وصلت للحد الأدنى"
          />
          <AlertCard
            emoji="🟠"
            label="تنتهي خلال 30 يوماً"
            count={d.expiring_soon_count}
            accentBg="#FFF7ED"
            accentColor="#C2410C"
            description="دفعات تنتهي صلاحيتها قريباً"
          />

          {d.out_of_stock_count === 0 && d.low_stock_count === 0 && d.expiring_soon_count === 0 && (
            <div
              className="rounded-2xl p-6 text-center"
              style={{ background: 'var(--color-status-success-bg)' }}
            >
              <p className="text-4xl">✅</p>
              <p className="mt-2 font-bold" style={{ color: 'var(--color-status-success)' }}>
                المخزون بحالة ممتازة!
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--color-status-success)' }}>
                لا توجد تنبيهات تستدعي الاهتمام
              </p>
            </div>
          )}

          <div
            className="rounded-2xl p-4"
            style={{ background: 'var(--color-surface-secondary)', border: '1px solid var(--color-ivory-border)' }}
          >
            <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>
              ℹ️ لعرض قائمة المنتجات التفصيلية، افتح تطبيق الصيدلية على الحاسب. تظهر هنا إحصائيات موجزة فقط.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
