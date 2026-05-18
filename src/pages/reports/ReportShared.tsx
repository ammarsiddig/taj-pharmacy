import { useTranslation } from 'react-i18next';

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function monthStartStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function Loading() {
  const { t } = useTranslation();
  return <div className="app-card py-8 text-center text-sm text-ink-muted">{t('common.loading')}</div>;
}

export function Empty() {
  const { t } = useTranslation();
  return (
    <div className="app-card py-10 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-ivory-muted text-lg text-ink-muted">i</div>
      <p className="mt-3 text-sm font-medium text-ink-main">{t('reports.noData')}</p>
      <p className="mt-1 text-xs text-ink-muted">{t('reports.emptyTip')}</p>
    </div>
  );
}

export function UtilizationBar({ pct, rtl }: { pct: number; rtl?: boolean }) {
  const bounded = Math.max(0, Math.min(100, pct));
  const tone = bounded >= 100 ? 'bg-status-danger' : bounded >= 80 ? 'bg-status-warning' : 'bg-status-success';
  return (
    <div className="ms-auto flex w-32 items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ivory-border">
        <div
          className={`h-full ${tone}`}
          style={{ width: `${bounded}%`, marginInlineStart: rtl ? 'auto' : 0 }}
        />
      </div>
      <span className="w-10 text-end tabular-nums text-xs text-ink-main">{bounded.toFixed(1)}%</span>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-ink-muted">{label}</label>
      {children}
    </div>
  );
}

export function SummaryCard({ label, value, accent, plain }: {
  label: string; value: string; accent?: 'green' | 'red' | 'orange'; plain?: boolean;
}) {
  const { t } = useTranslation();
  const color = accent === 'green' ? 'text-status-success' : accent === 'red' ? 'text-status-danger' : accent === 'orange' ? 'text-status-warning' : 'text-ink-main';
  return (
    <div className="app-card p-4">
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      <p className={`text-xl font-bold tabular-nums mt-0.5 ${color}`}>
        {value} {!plain && <span className="text-sm font-normal text-ink-muted">{t('common.currency')}</span>}
      </p>
    </div>
  );
}

export function Section({ title, variant, children }: {
  title: string; variant?: 'danger' | 'warning'; children: React.ReactNode;
}) {
  const bg = variant === 'danger' ? 'bg-status-danger/5 border-status-danger/20'
    : variant === 'warning' ? 'bg-status-warning-bg border-status-warning/20'
    : 'bg-ivory-surface border-ivory-border';
  return (
    <div className={`rounded-xl border p-4 shadow-[var(--shadow-soft)] ${bg}`}>
      <h4 className="text-sm font-bold text-ink-main mb-2">{title}</h4>
      {children}
    </div>
  );
}

export function Th({ children, end }: { children: React.ReactNode; end?: boolean }) {
  return <th className={`py-2 px-3 text-sm font-medium ${end ? 'text-end' : 'text-start'}`}>{children}</th>;
}

export function Td({ children, end, mono, className = '' }: {
  children: React.ReactNode; end?: boolean; mono?: boolean; className?: string;
}) {
  return (
    <td className={`py-2 px-3 ${end ? 'text-end' : 'text-start'} ${mono ? 'tabular-nums' : ''} ${className}`}>
      {children}
    </td>
  );
}
