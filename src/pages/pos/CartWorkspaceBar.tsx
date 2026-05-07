import { Archive, Plus, ShoppingCart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PosCartWorkspace } from './workspaceState';

interface CartWorkspaceBarProps {
  workspaces: PosCartWorkspace[];
  activeWorkspaceId: string;
  parkedCount: number;
  onSwitch: (workspaceId: string) => void;
  onAdd: () => void;
  onPark: () => void;
  onToggleParked: () => void;
}

export default function CartWorkspaceBar({
  workspaces,
  activeWorkspaceId,
  parkedCount,
  onSwitch,
  onAdd,
  onPark,
  onToggleParked,
}: CartWorkspaceBarProps) {
  const { t } = useTranslation();

  return (
    <div className="app-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {workspaces.map((workspace) => (
          <button
            key={workspace.id}
            type="button"
            onClick={() => onSwitch(workspace.id)}
            className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition-colors ${
              workspace.id === activeWorkspaceId
                ? 'border-primary-600 bg-primary-600 text-white shadow-[var(--shadow-card)]'
                : 'border-ivory-border bg-white text-ink-main hover:bg-primary-50'
            }`}
          >
            <ShoppingCart size={14} />
            <span>{workspace.name}</span>
            {workspace.cart.length > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${workspace.id === activeWorkspaceId ? 'bg-white/20 text-white' : 'bg-ivory-muted text-ink-muted'}`}>
                {workspace.cart.length}
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-2 rounded-2xl border border-dashed border-primary-300 bg-primary-50 px-3 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100"
        >
          <Plus size={14} />
          {t('pos.newCart')}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPark}
          className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
        >
          {t('pos.parkSale')}
        </button>
        <button
          type="button"
          onClick={onToggleParked}
          className="inline-flex items-center gap-2 rounded-2xl border border-ivory-border bg-white px-3 py-2 text-sm font-medium text-ink-main hover:bg-ivory-muted"
        >
          <Archive size={14} />
          {t('pos.parkedSales')}
          {parkedCount > 0 && (
            <span className="rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] text-primary-700">{parkedCount}</span>
          )}
        </button>
      </div>
    </div>
  );
}
