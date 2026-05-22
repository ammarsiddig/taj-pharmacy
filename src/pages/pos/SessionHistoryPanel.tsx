import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ChevronDown, FileText, Package, ArrowLeftRight, Printer, Trash2, RefreshCw, TrendingUp } from 'lucide-react';
import * as api from '../../api';
import type { SessionRow, SessionSaleRow, ProductSummaryRow, SessionReturnRow } from '../../types';
import Badge from '../../components/ui/Badge';

interface Props {
  branchId: string;
  cashierId: string;
  onClose: () => void;
  onReprint: (saleId: string) => void;
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function formatDuration(from: string, to?: string): string {
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  const mins = Math.round((end - start) / 60000);
  if (mins < 60) return `${mins}د`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}س ${m}د` : `${h}س`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SessionHistoryPanel({ branchId, cashierId, onClose, onReprint }: Props) {
  const { t } = useTranslation();
  const [history, setHistory] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(todayStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [sessionDetailTab, setSessionDetailTab] = useState<'sales' | 'products' | 'returns'>('sales');
  const [sessionSales, setSessionSales] = useState<Record<string, SessionSaleRow[]>>({});
  const [sessionProducts, setSessionProducts] = useState<Record<string, ProductSummaryRow[]>>({});
  const [sessionReturns, setSessionReturns] = useState<Record<string, SessionReturnRow[]>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [voidReasonFor, setVoidReasonFor] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.getSessionHistory(branchId, cashierId || undefined, dateFrom, dateTo + 'T23:59:59');
      setHistory(rows);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [branchId, cashierId, dateFrom, dateTo]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleVoidConfirm = async (sale: SessionSaleRow, sessionId: string) => {
    setVoidingId(sale.id);
    setVoidError(null);
    try {
      await api.voidSale(sale.id, cashierId, voidReason || undefined);
      setSessionSales(prev => ({
        ...prev,
        [sessionId]: (prev[sessionId] || []).filter(s => s.id !== sale.id),
      }));
      setVoidReasonFor(null);
      setVoidReason('');
    } catch (e: unknown) {
      setVoidError(String(e));
    } finally {
      setVoidingId(null);
    }
  };

  const loadSessionDetail = async (sessionId: string) => {
    setDetailLoading(sessionId);
    try {
      const [sales, products, returns] = await Promise.all([
        api.getSessionSales(sessionId),
        api.getSessionProductSummary(sessionId),
        api.getSessionReturns(sessionId),
      ]);
      setSessionSales(prev => ({ ...prev, [sessionId]: sales }));
      setSessionProducts(prev => ({ ...prev, [sessionId]: products }));
      setSessionReturns(prev => ({ ...prev, [sessionId]: returns }));
    } catch (err) {
      console.error('[SessionHistory] Failed to load session detail:', err);
    } finally {
      setDetailLoading(null);
    }
  };

  const toggleSessionExpand = (sessionId: string) => {
    if (expandedSession === sessionId) {
      setExpandedSession(null);
    } else {
      setExpandedSession(sessionId);
      setSessionDetailTab('sales');
      if (!sessionSales[sessionId]) loadSessionDetail(sessionId);
    }
  };

  return (
    <div className="fixed inset-0 z-[65] flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative me-auto h-full w-[480px] border-l border-ivory-border bg-ivory-app shadow-[var(--shadow-float)] flex flex-col"
        onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-ivory-border">
          <h3 className="font-bold text-ink-main">{t('pos.history')}</h3>
          <button onClick={onClose} className="p-1 text-ink-muted hover:text-ink-main">
            <X size={18} />
          </button>
        </div>

        {/* Date filter */}
        <div className="px-4 py-2 border-b border-ivory-border bg-ivory-surface flex items-center gap-2 text-xs">
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="app-input px-2 py-1 text-xs text-ink-main focus:outline-none focus:border-primary-500"
          />
          <span className="text-ink-muted">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="app-input px-2 py-1 text-xs text-ink-main focus:outline-none focus:border-primary-500"
          />
          <button
            onClick={loadHistory}
            disabled={loading}
            className="me-auto p-1.5 rounded-lg border border-ivory-border bg-white text-ink-muted hover:text-primary-600 disabled:opacity-40"
            title={t('common.refresh')}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <span className="text-ink-placeholder">{history.length} {t('pos.sessions', { count: history.length })}</span>
        </div>

        {/* Void reason dialog */}
        {voidReasonFor && (() => {
          const sale = Object.values(sessionSales).flat().find(s => s.id === voidReasonFor);
          return (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30">
              <div className="bg-white rounded-2xl shadow-[var(--shadow-float)] p-5 w-72 mx-4">
                <h4 className="font-bold text-ink-main mb-1 text-sm">{t('pos.void')} — {sale?.sale_number}</h4>
                <p className="text-xs text-ink-muted mb-3">{t('pos.voidReasonHint')}</p>
                <input
                  type="text"
                  autoFocus
                  placeholder={t('pos.voidReason')}
                  value={voidReason}
                  onChange={e => setVoidReason(e.target.value)}
                  className="app-input w-full px-3 py-2 text-sm mb-3 focus:outline-none focus:border-primary-500"
                />
                {voidError && <p className="text-xs text-status-danger mb-2">{voidError}</p>}
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setVoidReasonFor(null); setVoidReason(''); setVoidError(null); }}
                    className="px-3 py-1.5 rounded-lg border border-ivory-border text-xs text-ink-muted hover:bg-ivory-muted">
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={() => { if (sale) { const sid = Object.entries(sessionSales).find(([, arr]) => arr.some(s => s.id === sale.id))?.[0] ?? ''; handleVoidConfirm(sale, sid); } }}
                    disabled={voidingId === voidReasonFor}
                    className="px-3 py-1.5 rounded-lg bg-status-danger text-white text-xs font-medium disabled:opacity-40">
                    {voidingId === voidReasonFor ? t('common.loading') : t('pos.void')}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {voidError && !voidReasonFor && (
          <div className="mx-4 mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-status-danger">{voidError}</div>
        )}

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && history.length === 0 ? (
            <div className="text-center py-10 text-ink-muted text-sm">{t('common.loading')}</div>
          ) : history.length === 0 ? (
            <div className="text-center py-10 text-ink-muted text-sm">{t('pos.noSales')}</div>
          ) : (
            history.map(s => {
              const diff = s.cash_difference ?? 0;
              const isExpanded = expandedSession === s.id;
              const netSales = s.total_sales - s.total_returns;
              return (
                <div key={s.id} className="app-card overflow-hidden">
                  {/* Session header row */}
                  <button
                    className="w-full text-right p-3 hover:bg-ivory-muted"
                    onClick={() => toggleSessionExpand(s.id)}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink-main">{s.cashier_name}</span>
                        <span className="text-[10px] text-ink-placeholder border border-ivory-border rounded px-1.5 py-0.5">
                          {formatDuration(s.opened_at, s.closed_at)}
                        </span>
                      </div>
                      <Badge variant={s.status === 'open' ? 'success' : 'neutral'}>
                        {s.status === 'open' ? t('pos.sessionOpen') : t('pos.sessionClosed')}
                      </Badge>
                    </div>
                    <div className="text-xs text-ink-muted space-y-0.5 mb-2">
                      <div>{t('pos.sessionOpenTime')}: {formatDateTime(s.opened_at)}</div>
                      {s.closed_at && <div>{t('pos.sessionCloseTime')}: {formatDateTime(s.closed_at)}</div>}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs border-t border-ivory-border pt-2">
                      <div className="flex justify-between">
                        <span className="text-ink-muted">{t('pos.sessionSalesCount')}:</span>
                        <span className="tabular-nums text-ink-main">{s.sales_count}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-muted">{t('pos.sessionTotal')}:</span>
                        <span className="tabular-nums font-bold text-ink-main">{api.formatMoney(s.total_sales)}</span>
                      </div>
                      {s.total_returns > 0 && (
                        <div className="flex justify-between">
                          <span className="text-ink-muted">{t('pos.totalReturns')}:</span>
                          <span className="tabular-nums text-status-danger">-{api.formatMoney(s.total_returns)}</span>
                        </div>
                      )}
                      {s.total_returns > 0 && (
                        <div className="flex justify-between">
                          <span className="text-ink-muted">{t('pos.netSales')}:</span>
                          <span className="tabular-nums font-bold text-primary-700">{api.formatMoney(netSales)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-ink-muted">{t('pos.sessionOpeningCash')}:</span>
                        <span className="tabular-nums text-ink-main">{api.formatMoney(s.opening_cash)}</span>
                      </div>
                      {s.cash_difference !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-ink-muted">{t('pos.sessionDifference')}:</span>
                          <span className={`tabular-nums font-bold ${
                            diff > 0 ? 'text-status-success' : diff < 0 ? 'text-status-danger' : 'text-ink-muted'
                          }`}>
                            {diff > 0
                              ? `${t('pos.sessionSurplus')}${api.formatMoney(diff)}`
                              : diff < 0
                                ? `${t('pos.sessionShortage')} ${api.formatMoney(diff)}`
                                : t('pos.sessionBalanced')}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex justify-center mt-1">
                      <ChevronDown size={14} className={`text-ink-placeholder transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-ivory-border bg-ivory-muted">
                      <div className="flex border-b border-ivory-border">
                        {(['sales', 'products', 'returns'] as const).map(tab => (
                          <button
                            key={tab}
                            onClick={() => setSessionDetailTab(tab)}
                            className={`flex-1 py-2 text-xs font-medium flex items-center justify-center gap-1 ${
                              sessionDetailTab === tab
                                ? 'text-primary-600 border-b-2 border-primary-600'
                                : 'text-ink-muted hover:text-ink-main'
                            }`}
                          >
                            {tab === 'sales' && <><FileText size={12} />{t('pos.salesList')}</>}
                            {tab === 'products' && <><Package size={12} />{t('pos.productSummary')}</>}
                            {tab === 'returns' && <><ArrowLeftRight size={12} />{t('pos.returnsList')}</>}
                          </button>
                        ))}
                      </div>

                      <div className="px-3 py-2 max-h-72 overflow-y-auto">
                        {detailLoading === s.id ? (
                          <div className="text-center py-4 text-xs text-ink-muted">{t('common.loading')}</div>
                        ) : sessionDetailTab === 'sales' && (
                          (sessionSales[s.id] || []).length === 0
                            ? <div className="text-center py-3 text-xs text-ink-muted">{t('pos.noSales')}</div>
                            : <div className="space-y-1">
                                {(sessionSales[s.id] || []).map(sale => (
                                  <div key={sale.id} className="p-2 bg-ivory-surface rounded text-xs border border-ivory-border">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-medium text-ink-main">{sale.sale_number}</span>
                                        <span className="text-ink-placeholder">{formatTime(sale.created_at)}</span>
                                        <span className="text-ink-muted">({sale.items_count} {t('pos.items')})</span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <Badge variant={
                                          sale.payment_method === 'cash' ? 'success'
                                          : sale.payment_method === 'credit' ? 'warning'
                                          : 'neutral'
                                        }>
                                          {sale.payment_method === 'cash' ? t('pos.cash')
                                            : sale.payment_method === 'credit' ? t('customers.credit')
                                            : t('pos.bankTransfer')}
                                        </Badge>
                                        <span className="tabular-nums font-bold">{api.formatMoney(sale.total)}</span>
                                        <button
                                          onClick={e => { e.stopPropagation(); onReprint(sale.id); }}
                                          className="p-1 text-ink-muted hover:text-primary-600"
                                          title={t('pos.reprint')}
                                        >
                                          <Printer size={12} />
                                        </button>
                                        {s.status === 'open' && (
                                          <button
                                            onClick={e => { e.stopPropagation(); setVoidReasonFor(sale.id); setVoidReason(''); setVoidError(null); }}
                                            disabled={voidingId === sale.id}
                                            className="p-1 text-status-danger hover:bg-red-50 rounded disabled:opacity-40"
                                            title={t('pos.void')}
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    {sale.customer_name && (
                                      <div className="mt-1 text-[10px] text-ink-muted">
                                        {t('customers.title')}: <span className="font-medium text-ink-main">{sale.customer_name}</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                        )}

                        {sessionDetailTab === 'products' && (
                          (sessionProducts[s.id] || []).length === 0
                            ? <div className="text-center py-3 text-xs text-ink-muted">{t('pos.noSales')}</div>
                            : <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-ink-muted border-b border-ivory-border">
                                    <th className="text-right py-1 font-medium">{t('pos.product')}</th>
                                    <th className="text-center py-1 font-medium w-12">{t('pos.quantity')}</th>
                                    <th className="text-right py-1 font-medium w-16">{t('pos.total')}</th>
                                    <th className="text-right py-1 font-medium w-16 flex items-center gap-0.5 justify-end">
                                      <TrendingUp size={10} />{t('pos.profit')}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(sessionProducts[s.id] || []).map((p, i) => (
                                    <tr key={i} className="border-b border-ivory-border last:border-0">
                                      <td className="py-1 text-ink-main">{p.product_name}</td>
                                      <td className="py-1 text-center tabular-nums">
                                        {p.net_qty}
                                        {p.total_returned > 0 && <span className="text-status-danger text-[10px]"> (-{p.total_returned})</span>}
                                      </td>
                                      <td className="py-1 tabular-nums font-bold">{api.formatMoney(p.net_amount)}</td>
                                      <td className={`py-1 tabular-nums font-medium ${p.profit >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
                                        {api.formatMoney(p.profit)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t-2 border-ivory-border font-bold">
                                    <td className="py-1 text-ink-muted">{t('common.total')}</td>
                                    <td className="py-1 text-center tabular-nums">
                                      {(sessionProducts[s.id] || []).reduce((a, p) => a + p.net_qty, 0)}
                                    </td>
                                    <td className="py-1 tabular-nums">{api.formatMoney((sessionProducts[s.id] || []).reduce((a, p) => a + p.net_amount, 0))}</td>
                                    <td className={`py-1 tabular-nums ${(sessionProducts[s.id] || []).reduce((a, p) => a + p.profit, 0) >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
                                      {api.formatMoney((sessionProducts[s.id] || []).reduce((a, p) => a + p.profit, 0))}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                        )}

                        {sessionDetailTab === 'returns' && (
                          (sessionReturns[s.id] || []).length === 0
                            ? <div className="text-center py-3 text-xs text-ink-muted">{t('pos.noReturns')}</div>
                            : <div className="space-y-1">
                                {(sessionReturns[s.id] || []).map(ret => (
                                  <div key={ret.id} className="flex items-center justify-between p-2 bg-ivory-surface rounded text-xs border border-ivory-border">
                                    <div>
                                      <span className="font-medium text-ink-main">{ret.return_number}</span>
                                      <span className="text-ink-muted me-2">← {ret.sale_number}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Badge variant={ret.return_type === 'full' ? 'danger' : 'warning'}>
                                        {ret.return_type === 'full' ? t('pos.returnFull') : t('pos.returnPartial')}
                                      </Badge>
                                      <span className="tabular-nums font-bold text-status-danger">-{api.formatMoney(ret.total)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                        )}
                      </div>

                      {/* Payment breakdown footer */}
                      {sessionDetailTab === 'sales' && (sessionSales[s.id] || []).length > 0 && (() => {
                        const sales = sessionSales[s.id] || [];
                        const cashTotal = sales.filter(sl => sl.payment_method === 'cash').reduce((sum, sl) => sum + sl.total, 0);
                        const bankTotal = sales.filter(sl => sl.payment_method === 'bank_transfer').reduce((sum, sl) => sum + sl.total, 0);
                        const creditTotal = sales.filter(sl => sl.payment_method === 'credit').reduce((sum, sl) => sum + sl.total, 0);
                        const rets = sessionReturns[s.id] || [];
                        const retTotal = rets.reduce((sum, r) => sum + r.total, 0);
                        return (
                          <div className="px-3 py-2 border-t border-ivory-border bg-ivory-surface">
                            <div className="text-[10px] font-medium text-ink-muted mb-1">{t('pos.paymentSplit')}</div>
                            <div className="grid grid-cols-2 gap-1 text-xs">
                              {cashTotal > 0 && <div className="flex justify-between"><span className="text-ink-muted">{t('pos.cashSales')}:</span><span className="tabular-nums">{api.formatMoney(cashTotal)}</span></div>}
                              {bankTotal > 0 && <div className="flex justify-between"><span className="text-ink-muted">{t('pos.bankSales')}:</span><span className="tabular-nums">{api.formatMoney(bankTotal)}</span></div>}
                              {creditTotal > 0 && <div className="flex justify-between"><span className="text-status-warning">{t('customers.credit')}:</span><span className="tabular-nums text-status-warning">{api.formatMoney(creditTotal)}</span></div>}
                              {retTotal > 0 && <div className="flex justify-between col-span-2"><span className="text-status-danger">{t('pos.totalReturns')}:</span><span className="tabular-nums text-status-danger">-{api.formatMoney(retTotal)}</span></div>}
                              <div className="flex justify-between col-span-2 border-t border-ivory-border pt-1 font-bold">
                                <span>{t('pos.netSales')}:</span>
                                <span className="tabular-nums">{api.formatMoney(s.total_sales - retTotal)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
