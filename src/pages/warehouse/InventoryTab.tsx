import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, RotateCcw } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import {
  getStorageLocations, getLocationBatches, disposeBatch, recallBatch,
} from '../../api';
import type { StorageLocationFull, BatchRow, RecalledBatch } from '../../types';
import { fmt, fmtDate } from './WarehouseShared';

interface Props {
  branchId: string;
  openingBranchId?: string;
}

export default function InventoryTab({ branchId }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [locations, setLocations] = useState<StorageLocationFull[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [disposeTarget, setDisposeTarget] = useState<BatchRow | null>(null);
  const [disposeQty, setDisposeQty] = useState('1');
  const [disposeReason, setDisposeReason] = useState('');
  const [disposing, setDisposing] = useState(false);
  const [disposeError, setDisposeError] = useState('');
  const [showRecall, setShowRecall] = useState(false);
  const [recallBatchNumber, setRecallBatchNumber] = useState('');
  const [recallReason, setRecallReason] = useState('');
  const [recalling, setRecalling] = useState(false);
  const [recallError, setRecallError] = useState('');
  const [recalledBatches, setRecalledBatches] = useState<RecalledBatch[] | null>(null);

  useEffect(() => {
    getStorageLocations(branchId).then(locs => {
      const active = locs.filter(l => l.is_active);
      setLocations(active);
      if (active.length > 0) setSelectedLocationId(active[0].id);
    }).catch(() => {});
  }, [branchId]);

  useEffect(() => {
    if (!selectedLocationId) return;
    setLoading(true);
    getLocationBatches(selectedLocationId)
      .then(setBatches)
      .catch(() => setBatches([]))
      .finally(() => setLoading(false));
  }, [selectedLocationId]);

  const filtered = search
    ? batches.filter(b =>
        b.product_name.toLowerCase().includes(search.toLowerCase()) ||
        (b.product_name_ar && b.product_name_ar.toLowerCase().includes(search.toLowerCase())) ||
        (b.batch_number ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : batches;

  const totalQty = batches.reduce((sum, b) => sum + b.quantity_current, 0);
  const inp = 'app-input w-full px-3 py-2 text-sm';

  async function handleRecall() {
    if (!user) return;
    if (!recallBatchNumber.trim()) { setRecallError(t('common.required')); return; }
    setRecalling(true);
    setRecallError('');
    setRecalledBatches(null);
    try {
      const result = await recallBatch(branchId, user.id, recallBatchNumber.trim(), recallReason || undefined);
      setRecalledBatches(result);
    } catch (e: unknown) {
      setRecallError(String(e));
    } finally {
      setRecalling(false);
    }
  }

  function closeRecall() {
    setShowRecall(false);
    setRecallBatchNumber('');
    setRecallReason('');
    setRecallError('');
    setRecalledBatches(null);
    if (selectedLocationId) {
      setLoading(true);
      getLocationBatches(selectedLocationId).then(setBatches).catch(() => setBatches([])).finally(() => setLoading(false));
    }
  }

  async function handleDispose() {
    if (!disposeTarget || !user) return;
    const qty = parseInt(disposeQty, 10);
    if (isNaN(qty) || qty <= 0) { setDisposeError(t('warehouse.dispose.invalidQty')); return; }
    if (qty > disposeTarget.quantity_current) { setDisposeError(t('warehouse.dispose.exceedsAvailable')); return; }
    setDisposing(true);
    setDisposeError('');
    try {
      await disposeBatch(branchId, user.id, disposeTarget.id, qty, disposeReason || undefined);
      setDisposeTarget(null);
      setDisposeQty('1');
      setDisposeReason('');
      // Reload batches
      if (selectedLocationId) {
        setLoading(true);
        getLocationBatches(selectedLocationId).then(setBatches).catch(() => setBatches([])).finally(() => setLoading(false));
      }
    } catch (e: unknown) {
      setDisposeError(String(e));
    } finally {
      setDisposing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
        <button
          onClick={() => setShowRecall(true)}
          className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
        >
          <RotateCcw size={15} />
          {t('warehouse.recall.btn')}
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <label className="mb-1 block text-xs font-medium text-ink-muted">{t('warehouse.transfer.from')}</label>
          <select
            className={inp}
            value={selectedLocationId}
            onChange={e => setSelectedLocationId(e.target.value)}
          >
            {locations.map(l => (
              <option key={l.id} value={l.id}>{l.name_ar || l.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-ink-muted">{t('common.search')}</label>
          <input
            className={inp}
            placeholder={t('purchases.searchProduct')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="rounded-xl border border-ivory-border bg-ivory-muted px-4 py-2 text-sm">
          <span className="text-ink-muted">{t('warehouse.stockTake.totalItems')}: </span>
          <span className="font-bold text-ink-main">{batches.length}</span>
          <span className="mx-2 text-ink-muted">|</span>
          <span className="text-ink-muted">{t('warehouse.movements.qty')}: </span>
          <span className="font-bold text-ink-main">{totalQty}</span>
        </div>
      </div>

      {/* Table */}
      <div className="app-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ivory-muted">
            <tr>
              <th className="px-4 py-3 text-start text-xs font-semibold text-ink-muted">#</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-ink-muted">{t('warehouse.movements.product')}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-ink-muted">{t('purchases.batchNumber')}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-ink-muted">{t('purchases.expiryDate')}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-ink-muted">{t('warehouse.movements.qty')}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-ink-muted">{t('purchases.unitCost')}</th>
              <th className="px-4 py-3 text-xs font-semibold text-ink-muted"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-muted">{t('common.loading')}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-muted">{t('warehouse.movements.noMovements')}</td></tr>
            ) : (
              filtered.map((b, i) => (
                <tr key={b.id} className="border-b border-ivory-border hover:bg-ivory-muted/50">
                  <td className="px-4 py-3 tabular-nums text-ink-muted">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-ink-main">{b.product_name_ar || b.product_name}</td>
                  <td className="px-4 py-3 text-ink-muted">{b.batch_number}</td>
                  <td className="px-4 py-3 text-ink-muted">{fmtDate(b.expiry_date)}</td>
                  <td className="px-4 py-3 text-end tabular-nums font-semibold text-ink-main">{b.quantity_current}</td>
                  <td className="px-4 py-3 text-end tabular-nums text-ink-muted">{fmt(b.unit_cost)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => { setDisposeTarget(b); setDisposeQty('1'); setDisposeReason(''); setDisposeError(''); }}
                      className="flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-status-danger hover:bg-red-50"
                      title={t('warehouse.dispose.title')}
                    >
                      <Trash2 size={13} />
                      {t('warehouse.dispose.btn')}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Recall modal */}
      {showRecall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-lg rounded-2xl border border-ivory-border bg-white shadow-[var(--shadow-float)]">
            <div className="px-6 py-4 border-b border-ivory-border flex items-center gap-3">
              <RotateCcw size={18} className="text-amber-600" />
              <div>
                <h3 className="font-semibold text-ink-main">{t('warehouse.recall.title')}</h3>
                <p className="text-xs text-ink-muted mt-0.5">{t('warehouse.recall.batchNumberPlaceholder')}</p>
              </div>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('warehouse.recall.batchNumber')}</label>
                <input
                  value={recallBatchNumber}
                  onChange={e => { setRecallBatchNumber(e.target.value); setRecalledBatches(null); setRecallError(''); }}
                  placeholder={t('warehouse.recall.batchNumberPlaceholder')}
                  className="app-input w-full px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('warehouse.recall.reason')}</label>
                <input
                  value={recallReason}
                  onChange={e => setRecallReason(e.target.value)}
                  placeholder={t('warehouse.recall.reasonPlaceholder')}
                  className="app-input w-full px-3 py-2 text-sm"
                />
              </div>
              {recallError && <p className="text-sm text-status-danger">{recallError}</p>}
              {recalledBatches && recalledBatches.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="mb-2 text-xs font-semibold text-amber-800">{t('warehouse.recall.preview')} ({recalledBatches.length})</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-amber-700">
                        <th className="text-start pb-1">{t('warehouse.recall.product')}</th>
                        <th className="text-start pb-1">{t('warehouse.recall.location')}</th>
                        <th className="text-end pb-1">{t('warehouse.recall.qty')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recalledBatches.map(rb => (
                        <tr key={rb.id} className="border-t border-amber-100">
                          <td className="py-1 text-ink-main">{rb.product_name}</td>
                          <td className="py-1 text-ink-muted">{rb.location_name}</td>
                          <td className="py-1 text-end font-semibold text-status-danger">{rb.quantity_recalled}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-ivory-border flex gap-3">
              <button onClick={closeRecall} className="flex-1 rounded-xl border border-ivory-border py-2 text-sm text-ink-muted hover:bg-ivory-muted">{t('common.close')}</button>
              {recalledBatches ? (
                <button onClick={closeRecall} className="flex-1 rounded-xl bg-primary-600 py-2 text-sm font-semibold text-white hover:opacity-90">
                  {t('common.done')}
                </button>
              ) : (
                <button
                  onClick={handleRecall}
                  disabled={recalling}
                  className="flex-1 rounded-xl bg-amber-600 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {recalling ? t('common.loading') : t('warehouse.recall.confirm')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dispose modal */}
      {disposeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-ivory-border bg-white shadow-[var(--shadow-float)]">
            <div className="px-6 py-4 border-b border-ivory-border">
              <h3 className="font-semibold text-ink-main">{t('warehouse.dispose.title')}</h3>
              <p className="mt-1 text-sm text-ink-muted">{disposeTarget.product_name_ar || disposeTarget.product_name} — {disposeTarget.batch_number}</p>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('warehouse.dispose.qty')} ({t('warehouse.dispose.available')}: {disposeTarget.quantity_current})</label>
                <input
                  type="number" min={1} max={disposeTarget.quantity_current}
                  value={disposeQty}
                  onChange={e => setDisposeQty(e.target.value)}
                  className="app-input w-full px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('warehouse.dispose.reason')}</label>
                <input
                  value={disposeReason}
                  onChange={e => setDisposeReason(e.target.value)}
                  placeholder={t('warehouse.dispose.reasonPlaceholder')}
                  className="app-input w-full px-3 py-2 text-sm"
                />
              </div>
              {disposeError && <p className="text-sm text-status-danger">{disposeError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-ivory-border flex gap-3">
              <button onClick={() => setDisposeTarget(null)} className="flex-1 rounded-xl border border-ivory-border py-2 text-sm text-ink-muted hover:bg-ivory-muted">{t('common.cancel')}</button>
              <button
                onClick={handleDispose}
                disabled={disposing}
                className="flex-1 rounded-xl bg-status-danger py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {disposing ? t('common.loading') : t('warehouse.dispose.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
