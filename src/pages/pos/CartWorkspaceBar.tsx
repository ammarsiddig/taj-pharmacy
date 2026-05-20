import { useState } from 'react';
import { Archive, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PosCartWorkspace } from './workspaceState';
import Modal from '../../components/ui/Modal';

interface CartWorkspaceBarProps {
  workspaces: PosCartWorkspace[];
  activeWorkspaceId: string;
  parkedWorkspaces: PosCartWorkspace[];
  onSwitch: (workspaceId: string) => void;
  onAdd: () => void;
  onPark: () => boolean;
  onRestore: (workspaceId: string) => void;
  onDelete: (workspaceId: string) => void;
}

export default function CartWorkspaceBar({
  workspaces,
  activeWorkspaceId,
  parkedWorkspaces,
  onSwitch,
  onAdd,
  onPark,
  onRestore,
  onDelete,
}: CartWorkspaceBarProps) {
  const { t } = useTranslation();
  const [showParkedSales, setShowParkedSales] = useState(false);
  const [deleteWorkspaceId, setDeleteWorkspaceId] = useState<string | null>(null);

  return (
    <>
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
            onClick={() => {
              const success = onPark();
              if (success) setShowParkedSales(true);
            }}
            className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
          >
            {t('pos.parkSale')}
          </button>
          <button
            type="button"
            onClick={() => setShowParkedSales(prev => !prev)}
            className="inline-flex items-center gap-2 rounded-2xl border border-ivory-border bg-white px-3 py-2 text-sm font-medium text-ink-main hover:bg-ivory-muted"
          >
            <Archive size={14} />
            {t('pos.parkedSales')}
            {parkedWorkspaces.length > 0 && (
              <span className="rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] text-primary-700">{parkedWorkspaces.length}</span>
            )}
          </button>
        </div>
      </div>

      <div className={`app-panel p-4 overflow-hidden transition-all duration-200 ease-out ${showParkedSales ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0 py-0'}`}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink-main">{t('pos.parkedSales')}</h3>
            <p className="text-xs text-ink-muted">{t('pos.parkedSalesHint')}</p>
          </div>
        </div>
        {parkedWorkspaces.length === 0 ? (
          <div className="rounded-2xl bg-ivory-muted px-4 py-6 text-center text-sm text-ink-muted">{t('pos.noParkedSales')}</div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {parkedWorkspaces.map((workspace) => (
              <div
                key={workspace.id}
                className="rounded-2xl border border-ivory-border bg-white px-4 py-3 text-right hover:border-primary-300 hover:bg-primary-50 group"
              >
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onRestore(workspace.id)}
                    className="flex-1 text-right font-medium text-ink-main hover:text-primary-600"
                  >
                    {workspace.name}
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onRestore(workspace.id)}
                      className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-100"
                    >
                      {t('pos.restoreSale')}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setDeleteWorkspaceId(workspace.id); }}
                      className="rounded-full p-1 text-ink-muted hover:text-status-danger hover:bg-red-50"
                      title={t('common.delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="mt-2 text-xs text-ink-muted">{workspace.cart.length} {t('pos.items')}</div>
                <div className="mt-1 text-xs text-ink-muted">{workspace.parkedAt ? new Date(workspace.parkedAt).toLocaleTimeString() : ''}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={!!deleteWorkspaceId}
        title={t('common.deleteWorkspace')}
        message={t('common.deleteWorkspaceConfirm')}
        variant="danger"
        onConfirm={() => { if (deleteWorkspaceId) { onDelete(deleteWorkspaceId); setDeleteWorkspaceId(null); } }}
        onCancel={() => setDeleteWorkspaceId(null)}
      />
    </>
  );
}
