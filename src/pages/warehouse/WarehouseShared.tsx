import type { ReactNode } from 'react';

// ─── helpers ────────────────────────────────────────────────────────────────

export function fmt(piasters: number) {
  return (piasters / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(iso?: string) {
  if (!iso) return '—';
  return iso.substring(0, 10);
}

export const MOVEMENT_COLORS: Record<string, string> = {
  receive: 'bg-green-100 text-green-800',
  sell: 'bg-blue-100 text-blue-800',
  customer_return: 'bg-yellow-100 text-yellow-800',
  supplier_return: 'bg-orange-100 text-orange-800',
  transfer_in: 'bg-teal-100 text-teal-800',
  transfer_out: 'bg-purple-100 text-purple-800',
  adjust: 'bg-gray-100 text-gray-800',
  dispose: 'bg-red-100 text-red-800',
};

// ─── sub-components ─────────────────────────────────────────────────────────

export function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-4 py-2.5 text-sm font-medium border transition-colors ${
        active
          ? 'border-primary-600 text-primary-600 bg-white shadow-[var(--shadow-soft)]'
          : 'border-ivory-border text-ink-muted bg-ivory-muted hover:text-ink-main hover:bg-white'
      }`}
    >
      <span className="inline-flex items-center gap-2">
        {icon}
        {children}
      </span>
    </button>
  );
}

export function EmptyBlock({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="py-10 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-ivory-muted text-ink-muted">i</div>
      <p className="mt-3 text-sm font-medium text-ink-main">{title}</p>
      {subtitle && <p className="mt-1 text-xs text-ink-muted">{subtitle}</p>}
    </div>
  );
}
