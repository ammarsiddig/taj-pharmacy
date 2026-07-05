import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X, FileText, Package, ArrowLeftRight, Printer, Trash2, RefreshCw,
  TrendingUp, Calendar, User as UserIcon, CreditCard, Search,
  Clock, CheckCircle2,
} from 'lucide-react';
import * as api from '../../api';
import type {
  SessionRow, SessionSaleRow, ProductSummaryRow, SessionReturnRow, User,
} from '../../types';
import Badge from '../../components/ui/Badge';

interface Props {
  branchId: string;
  cashierId: string;
  onClose: () => void;
  onReprint: (saleId: string) => void;
}

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

const formatDuration = (from: string, to?: string) => {
  const mins = Math.round((((to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()) / 60000));
  if (mins < 60) return `${mins}د`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}س ${m}د` : `${h}س`;
};

const todayStr = () => new Date().toISOString().slice(0, 10);

const daysAgoStr = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

const PAYMENT_METHODS = [
  { value: '', label: 'كل وسائل الدفع' },
  { value: 'cash', label: 'نقدي' },
  { value: 'bank_transfer', label: 'تحويل بنكي' },
  { value: 'credit', label: 'آجل' },
];

export default function SessionHistoryPanel({ branchId, cashierId, onClose, onReprint }: Props) {
  const { t } = useTranslation();

  // ─── State ────────────────────────────────────────────────────────────────
  const [history, setHistory] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  // Filters
  const [dateFrom, setDateFrom] = useState(daysAgoStr(6));
  const [dateTo, setDateTo] = useState(todayStr());
  const [cashierFilter, setCashierFilter] = useState(cashierId);
  const [paymentFilter, setPaymentFilter] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  // Selection + detail
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'sales' | 'products' | 'returns'>('sales');
  const [sessionSales, setSessionSales] = useState<Record<string, SessionSaleRow[]>>({});
  const [sessionProducts, setSessionProducts] = useState<Record<string, ProductSummaryRow[]>>({});
  const [sessionReturns, setSessionReturns] = useState<Record<string, SessionReturnRow[]>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  // Void flow
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [voidReasonFor, setVoidReasonFor] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');

  // ─── Data loading ─────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setLoading(true);
    setHistoryError(null);
    try {
      const rows = await api.getSessionHistory(
        branchId,
        cashierFilter || undefined,
        dateFrom,
        dateTo + 'T23:59:59',
      );
      setHistory(rows);
    } catch (err) {
      // Surface the failure instead of swallowing it — a broken query here used
      // to leave the panel silently empty (E2E issue #1).
      console.error('getSessionHistory failed:', err);
      setHistory([]);
      setHistoryError(String(err));
    } finally {
      setLoading(false);
    }
  }, [branchId, cashierFilter, dateFrom, dateTo]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  useEffect(() => {
    api.getUsers().then(setUsers).catch(() => {});
  }, []);

  const loadSessionDetail = useCallback(async (sessionId: string) => {
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
    } finally {
      setDetailLoading(null);
    }
  }, []);

  const selectSession = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
    setDetailTab('sales');
    if (!sessionSales[sessionId]) loadSessionDetail(sessionId);
  }, [sessionSales, loadSessionDetail]);

  // Auto-select first session when list loads
  useEffect(() => {
    if (!selectedSessionId && history.length > 0) {
      selectSession(history[0].id);
    } else if (selectedSessionId && !history.find(h => h.id === selectedSessionId)) {
      setSelectedSessionId(history[0]?.id ?? null);
    }
  }, [history, selectedSessionId, selectSession]);

  // ─── Client-side filtering of sessions by payment method + customer ──────
  const filteredHistory = useMemo(() => {
    if (!paymentFilter && !customerSearch.trim()) return history;
    return history.filter(s => {
      const sales = sessionSales[s.id];
      if (!sales) return true; // not loaded yet, don't filter out
      if (paymentFilter && !sales.some(sl => sl.payment_method === paymentFilter)) return false;
      if (customerSearch.trim()) {
        const q = customerSearch.trim().toLowerCase();
        if (!sales.some(sl => (sl.customer_name || '').toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [history, paymentFilter, customerSearch, sessionSales]);

  const selectedSession = filteredHistory.find(s => s.id === selectedSessionId) || history.find(s => s.id === selectedSessionId);

  // ─── Stats summary ────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    sessions: filteredHistory.length,
    totalSales: filteredHistory.reduce((a, s) => a + s.total_sales, 0),
    totalReturns: filteredHistory.reduce((a, s) => a + s.total_returns, 0),
    open: filteredHistory.filter(s => s.status === 'open').length,
  }), [filteredHistory]);

  // ─── Void ─────────────────────────────────────────────────────────────────
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
    } catch (e) {
      setVoidError(String(e));
    } finally {
      setVoidingId(null);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[65] flex bg-black/50">
      <div
        className="m-0 w-full h-full bg-ivory-app shadow-[var(--shadow-float)] flex flex-col"
        onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-ivory-border bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
              <FileText size={20} className="text-primary-700" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink-main">{t('pos.history')}</h2>
              <p className="text-xs text-ink-muted">سجل الجلسات والمبيعات</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-ink-muted hover:text-ink-main hover:bg-ivory-muted"
            title={t('common.close')}
          >
            <X size={20} />
          </button>
        </header>

        {/* ── Stats strip ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-3 px-6 py-4 bg-white border-b border-ivory-border">
          <StatCard
            icon={<FileText size={16} />}
            label="عدد الجلسات"
            value={String(stats.sessions)}
            tone="primary"
          />
          <StatCard
            icon={<TrendingUp size={16} />}
            label="إجمالي المبيعات"
            value={api.formatMoney(stats.totalSales)}
            tone="success"
          />
          <StatCard
            icon={<ArrowLeftRight size={16} />}
            label="إجمالي المرتجعات"
            value={api.formatMoney(stats.totalReturns)}
            tone={stats.totalReturns > 0 ? 'danger' : 'neutral'}
          />
          <StatCard
            icon={<Clock size={16} />}
            label="جلسات مفتوحة"
            value={String(stats.open)}
            tone={stats.open > 0 ? 'warning' : 'neutral'}
          />
        </div>

        {/* ── Filters bar ────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end gap-3 px-6 py-3 bg-ivory-surface border-b border-ivory-border">
          <FilterField label="من تاريخ" icon={<Calendar size={12} />}>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="app-input px-2 py-1.5 text-xs text-ink-main focus:outline-none focus:border-primary-500" />
          </FilterField>
          <FilterField label="إلى تاريخ" icon={<Calendar size={12} />}>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="app-input px-2 py-1.5 text-xs text-ink-main focus:outline-none focus:border-primary-500" />
          </FilterField>
          <FilterField label="الكاشير" icon={<UserIcon size={12} />}>
            <select value={cashierFilter} onChange={e => setCashierFilter(e.target.value)}
              className="app-input px-2 py-1.5 text-xs text-ink-main focus:outline-none focus:border-primary-500 min-w-[140px]">
              <option value="">كل الكاشيرين</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.full_name_ar || u.full_name}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="وسيلة الدفع" icon={<CreditCard size={12} />}>
            <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}
              className="app-input px-2 py-1.5 text-xs text-ink-main focus:outline-none focus:border-primary-500 min-w-[140px]">
              {PAYMENT_METHODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </FilterField>
          <FilterField label="البحث عن عميل" icon={<Search size={12} />}>
            <input type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
              placeholder="اسم العميل..."
              className="app-input px-2 py-1.5 text-xs text-ink-main focus:outline-none focus:border-primary-500 min-w-[160px]" />
          </FilterField>
          <button
            onClick={loadHistory}
            disabled={loading}
            className="ms-auto flex items-center gap-1.5 rounded-xl border border-ivory-border bg-white px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-primary-600 disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            تحديث
          </button>
        </div>

        {/* ── Body: master-detail ────────────────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT: sessions list */}
          <aside className="w-[380px] border-l border-ivory-border bg-white overflow-y-auto">
            {historyError ? (
              <div className="m-3 rounded-xl border border-status-danger/20 bg-status-danger-bg px-3 py-3 text-sm text-status-danger">
                <div className="font-medium">تعذّر تحميل سجل الجلسات</div>
                <div className="mt-1 text-xs break-words">{historyError}</div>
              </div>
            ) : loading && filteredHistory.length === 0 ? (
              <div className="text-center py-10 text-ink-muted text-sm">{t('common.loading')}</div>
            ) : filteredHistory.length === 0 ? (
              <EmptyState />
            ) : (
              <ul className="divide-y divide-ivory-border">
                {filteredHistory.map(s => (
                  <SessionListItem
                    key={s.id}
                    session={s}
                    selected={s.id === selectedSessionId}
                    onClick={() => selectSession(s.id)}
                  />
                ))}
              </ul>
            )}
          </aside>

          {/* RIGHT: session detail */}
          <main className="flex-1 overflow-y-auto bg-ivory-app">
            {!selectedSession ? (
              <div className="h-full flex items-center justify-center text-ink-muted text-sm">
                اختر جلسة من القائمة لعرض التفاصيل
              </div>
            ) : (
              <SessionDetail
                session={selectedSession}
                detailTab={detailTab}
                setDetailTab={setDetailTab}
                detailLoading={detailLoading === selectedSession.id}
                sales={sessionSales[selectedSession.id] || []}
                products={sessionProducts[selectedSession.id] || []}
                returns={sessionReturns[selectedSession.id] || []}
                onReprint={onReprint}
                onVoid={(saleId) => { setVoidReasonFor(saleId); setVoidReason(''); setVoidError(null); }}
                voidingId={voidingId}
                t={t}
              />
            )}
          </main>
        </div>

        {/* ── Void reason dialog ─────────────────────────────────────────── */}
        {voidReasonFor && (() => {
          const sale = Object.values(sessionSales).flat().find(s => s.id === voidReasonFor);
          const sessionId = Object.entries(sessionSales).find(([, arr]) => arr.some(s => s.id === voidReasonFor))?.[0] ?? '';
          return (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-[var(--shadow-float)] p-6 w-96 mx-4">
                <h4 className="font-bold text-ink-main mb-1">{t('pos.void')} — {sale?.sale_number}</h4>
                <p className="text-xs text-ink-muted mb-4">{t('pos.voidReasonHint')}</p>
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
                    className="px-4 py-2 rounded-xl border border-ivory-border text-sm text-ink-muted hover:bg-ivory-muted">
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={() => { if (sale) handleVoidConfirm(sale, sessionId); }}
                    disabled={voidingId === voidReasonFor}
                    className="px-5 py-2 rounded-xl bg-status-danger text-white text-sm font-semibold disabled:opacity-40">
                    {voidingId === voidReasonFor ? t('common.loading') : t('pos.void')}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function StatCard({ icon, label, value, tone }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'primary' | 'success' | 'danger' | 'warning' | 'neutral';
}) {
  const toneClasses = {
    primary: 'bg-primary-50 text-primary-700 border-primary-100',
    success: 'bg-green-50 text-green-700 border-green-100',
    danger: 'bg-red-50 text-red-700 border-red-100',
    warning: 'bg-yellow-50 text-yellow-700 border-yellow-100',
    neutral: 'bg-ivory-muted text-ink-muted border-ivory-border',
  }[tone];
  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClasses}`}>
      <div className="flex items-center gap-2 mb-1 text-xs font-medium opacity-75">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

function FilterField({ label, icon, children }: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-1 text-[10px] font-medium text-ink-muted">
        {icon} {label}
      </label>
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-ivory-muted flex items-center justify-center mb-3">
        <FileText size={20} className="text-ink-muted" />
      </div>
      <div className="text-sm text-ink-muted">لا توجد جلسات مطابقة</div>
      <div className="text-xs text-ink-placeholder mt-1">جرّب تعديل الفلاتر</div>
    </div>
  );
}

function SessionListItem({ session: s, selected, onClick }: {
  session: SessionRow;
  selected: boolean;
  onClick: () => void;
}) {
  const diff = s.cash_difference ?? 0;
  const netSales = s.total_sales - s.total_returns;
  return (
    <li>
      <button
        onClick={onClick}
        className={`w-full text-right p-4 transition-colors ${
          selected ? 'bg-primary-50 border-r-4 border-primary-600' : 'hover:bg-ivory-muted border-r-4 border-transparent'
        }`}
      >
        <div className="flex items-start justify-between mb-2">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-ink-main truncate">{s.cashier_name}</div>
            <div className="text-[11px] text-ink-muted mt-0.5 flex items-center gap-1">
              <Clock size={10} />
              {formatDateTime(s.opened_at)}
            </div>
          </div>
          {s.status === 'open' ? (
            <Badge variant="success">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse me-1"></span>
              مفتوحة
            </Badge>
          ) : (
            <Badge variant="neutral">مغلقة</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-ink-muted">{s.sales_count} فاتورة</span>
          <span className="text-ink-placeholder">•</span>
          <span className="text-ink-muted">{formatDuration(s.opened_at, s.closed_at)}</span>
        </div>
        <div className="mt-2 pt-2 border-t border-ivory-border/60 flex items-center justify-between">
          <span className="text-[11px] text-ink-muted">صافي المبيعات</span>
          <span className="text-sm font-bold tabular-nums text-primary-700">{api.formatMoney(netSales)}</span>
        </div>
        {s.cash_difference !== undefined && diff !== 0 && (
          <div className={`mt-1 text-[10px] tabular-nums ${diff > 0 ? 'text-status-success' : 'text-status-danger'}`}>
            {diff > 0 ? '+' : ''}{api.formatMoney(diff)} فرق صندوق
          </div>
        )}
      </button>
    </li>
  );
}

function SessionDetail({
  session: s, detailTab, setDetailTab, detailLoading,
  sales, products, returns, onReprint, onVoid, voidingId, t,
}: {
  session: SessionRow;
  detailTab: 'sales' | 'products' | 'returns';
  setDetailTab: (tab: 'sales' | 'products' | 'returns') => void;
  detailLoading: boolean;
  sales: SessionSaleRow[];
  products: ProductSummaryRow[];
  returns: SessionReturnRow[];
  onReprint: (saleId: string) => void;
  onVoid: (saleId: string) => void;
  voidingId: string | null;
  t: (key: string) => string;
}) {
  const diff = s.cash_difference ?? 0;
  const netSales = s.total_sales - s.total_returns;
  const cashTotal = sales.filter(sl => sl.payment_method === 'cash').reduce((a, sl) => a + sl.total, 0);
  const bankTotal = sales.filter(sl => sl.payment_method === 'bank_transfer').reduce((a, sl) => a + sl.total, 0);
  const creditTotal = sales.filter(sl => sl.payment_method === 'credit').reduce((a, sl) => a + sl.total, 0);

  return (
    <div className="p-6 space-y-4">
      {/* Session header card */}
      <div className="app-card p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-xl font-bold text-ink-main">{s.cashier_name}</h3>
              {s.status === 'open' ? (
                <Badge variant="success">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse me-1"></span>
                  مفتوحة
                </Badge>
              ) : (
                <Badge variant="neutral">مغلقة</Badge>
              )}
            </div>
            <div className="text-xs text-ink-muted flex items-center gap-3">
              <span className="flex items-center gap-1"><Clock size={11} />فُتحت {formatDateTime(s.opened_at)}</span>
              {s.closed_at && <span className="flex items-center gap-1"><CheckCircle2 size={11} />أُغلقت {formatDateTime(s.closed_at)}</span>}
              <span>•</span>
              <span>المدة {formatDuration(s.opened_at, s.closed_at)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <DetailMetric label="عدد الفواتير" value={String(s.sales_count)} tone="neutral" />
          <DetailMetric label="إجمالي المبيعات" value={api.formatMoney(s.total_sales)} tone="success" />
          {s.total_returns > 0
            ? <DetailMetric label="المرتجعات" value={`-${api.formatMoney(s.total_returns)}`} tone="danger" />
            : <DetailMetric label="المرتجعات" value={api.formatMoney(0)} tone="neutral" />
          }
          <DetailMetric label="صافي المبيعات" value={api.formatMoney(netSales)} tone="primary" highlight />
        </div>

        {/* Payment split */}
        {(cashTotal + bankTotal + creditTotal) > 0 && (
          <div className="mt-4 pt-4 border-t border-ivory-border">
            <div className="text-xs font-bold text-ink-muted mb-2">توزيع وسائل الدفع</div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              {cashTotal > 0 && <PaymentSplit label="نقدي" value={api.formatMoney(cashTotal)} tone="success" />}
              {bankTotal > 0 && <PaymentSplit label="تحويل بنكي" value={api.formatMoney(bankTotal)} tone="primary" />}
              {creditTotal > 0 && <PaymentSplit label="آجل" value={api.formatMoney(creditTotal)} tone="warning" />}
            </div>
          </div>
        )}

        {/* Cash reconciliation */}
        {s.cash_difference !== undefined && (
          <div className="mt-4 pt-4 border-t border-ivory-border">
            <div className="text-xs font-bold text-ink-muted mb-2">جردة الصندوق</div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <DetailMetric label="رصيد افتتاحي" value={api.formatMoney(s.opening_cash)} tone="neutral" />
              {s.actual_cash !== undefined && <DetailMetric label="الفعلي" value={api.formatMoney(s.actual_cash)} tone="neutral" />}
              <DetailMetric
                label="الفرق"
                value={diff > 0 ? `+${api.formatMoney(diff)}` : api.formatMoney(diff)}
                tone={diff > 0 ? 'success' : diff < 0 ? 'danger' : 'neutral'}
              />
            </div>
          </div>
        )}
      </div>

      {/* Detail tabs */}
      <div className="app-card overflow-hidden">
        <div className="flex border-b border-ivory-border bg-white">
          {([
            { key: 'sales', label: t('pos.salesList'), icon: <FileText size={14} /> },
            { key: 'products', label: t('pos.productSummary'), icon: <Package size={14} /> },
            { key: 'returns', label: t('pos.returnsList'), icon: <ArrowLeftRight size={14} /> },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setDetailTab(tab.key)}
              className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                detailTab === tab.key
                  ? 'text-primary-700 border-b-2 border-primary-600 bg-primary-50/40'
                  : 'text-ink-muted hover:text-ink-main'
              }`}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        <div className="bg-white">
          {detailLoading ? (
            <div className="text-center py-12 text-ink-muted text-sm">{t('common.loading')}</div>
          ) : detailTab === 'sales' ? (
            sales.length === 0
              ? <div className="text-center py-12 text-ink-muted text-sm">{t('pos.noSales')}</div>
              : <table className="w-full text-sm">
                  <thead className="bg-surface-secondary text-xs text-ink-muted">
                    <tr>
                      <th className="text-right p-3 font-medium">رقم الفاتورة</th>
                      <th className="text-right p-3 font-medium">الوقت</th>
                      <th className="text-right p-3 font-medium">الأصناف</th>
                      <th className="text-right p-3 font-medium">العميل</th>
                      <th className="text-right p-3 font-medium">طريقة الدفع</th>
                      <th className="text-right p-3 font-medium">الإجمالي</th>
                      <th className="text-right p-3 font-medium w-24">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ivory-border">
                    {sales.map(sale => (
                      <tr key={sale.id} className="hover:bg-ivory-muted">
                        <td className="p-3 font-medium text-ink-main">{sale.sale_number}</td>
                        <td className="p-3 text-ink-muted tabular-nums">{formatTime(sale.created_at)}</td>
                        <td className="p-3 text-ink-muted">{sale.items_count}</td>
                        <td className="p-3 text-ink-main">{sale.customer_name || '—'}</td>
                        <td className="p-3">
                          <Badge variant={
                            sale.payment_method === 'cash' ? 'success'
                            : sale.payment_method === 'credit' ? 'warning'
                            : 'neutral'
                          }>
                            {sale.payment_method === 'cash' ? t('pos.cash')
                              : sale.payment_method === 'credit' ? t('customers.credit')
                              : t('pos.bankTransfer')}
                          </Badge>
                        </td>
                        <td className="p-3 font-bold tabular-nums text-ink-main">{api.formatMoney(sale.total)}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => onReprint(sale.id)}
                              className="p-1.5 rounded-lg text-ink-muted hover:text-primary-600 hover:bg-primary-50"
                              title={t('pos.reprint')}
                            >
                              <Printer size={14} />
                            </button>
                            {s.status === 'open' && (
                              <button
                                onClick={() => onVoid(sale.id)}
                                disabled={voidingId === sale.id}
                                className="p-1.5 rounded-lg text-status-danger hover:bg-red-50 disabled:opacity-40"
                                title={t('pos.void')}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
          ) : detailTab === 'products' ? (
            products.length === 0
              ? <div className="text-center py-12 text-ink-muted text-sm">{t('pos.noSales')}</div>
              : <table className="w-full text-sm">
                  <thead className="bg-surface-secondary text-xs text-ink-muted">
                    <tr>
                      <th className="text-right p-3 font-medium">المنتج</th>
                      <th className="text-right p-3 font-medium w-20">الكمية</th>
                      <th className="text-right p-3 font-medium w-24">سعر الوحدة</th>
                      <th className="text-right p-3 font-medium w-28">الإجمالي</th>
                      <th className="text-right p-3 font-medium w-28">الربح</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ivory-border">
                    {products.map((p, i) => (
                      <tr key={i} className="hover:bg-ivory-muted">
                        <td className="p-3 text-ink-main">{p.product_name}</td>
                        <td className="p-3 tabular-nums">
                          {p.net_qty}
                          {p.total_returned > 0 && <span className="text-status-danger text-xs ms-1">(-{p.total_returned})</span>}
                        </td>
                        <td className="p-3 tabular-nums text-ink-muted">{api.formatMoney(p.unit_price)}</td>
                        <td className="p-3 tabular-nums font-bold">{api.formatMoney(p.net_amount)}</td>
                        <td className={`p-3 tabular-nums font-medium ${p.profit >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
                          <span className="inline-flex items-center gap-1">
                            <TrendingUp size={12} />{api.formatMoney(p.profit)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-ivory-border bg-ivory-muted font-bold">
                    <tr>
                      <td className="p-3 text-ink-muted">المجموع</td>
                      <td className="p-3 tabular-nums">{products.reduce((a, p) => a + p.net_qty, 0)}</td>
                      <td className="p-3"></td>
                      <td className="p-3 tabular-nums">{api.formatMoney(products.reduce((a, p) => a + p.net_amount, 0))}</td>
                      <td className={`p-3 tabular-nums ${products.reduce((a, p) => a + p.profit, 0) >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
                        {api.formatMoney(products.reduce((a, p) => a + p.profit, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
          ) : (
            returns.length === 0
              ? <div className="text-center py-12 text-ink-muted text-sm">{t('pos.noReturns')}</div>
              : <table className="w-full text-sm">
                  <thead className="bg-surface-secondary text-xs text-ink-muted">
                    <tr>
                      <th className="text-right p-3 font-medium">رقم المرتجع</th>
                      <th className="text-right p-3 font-medium">الفاتورة الأصلية</th>
                      <th className="text-right p-3 font-medium">النوع</th>
                      <th className="text-right p-3 font-medium">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ivory-border">
                    {returns.map(ret => (
                      <tr key={ret.id} className="hover:bg-ivory-muted">
                        <td className="p-3 font-medium text-ink-main">{ret.return_number}</td>
                        <td className="p-3 text-ink-muted">{ret.sale_number}</td>
                        <td className="p-3">
                          <Badge variant={ret.return_type === 'full' ? 'danger' : 'warning'}>
                            {ret.return_type === 'full' ? t('pos.returnFull') : t('pos.returnPartial')}
                          </Badge>
                        </td>
                        <td className="p-3 font-bold tabular-nums text-status-danger">-{api.formatMoney(ret.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailMetric({ label, value, tone, highlight }: {
  label: string;
  value: string;
  tone: 'primary' | 'success' | 'danger' | 'warning' | 'neutral';
  highlight?: boolean;
}) {
  const toneClasses = {
    primary: highlight ? 'bg-primary-600 text-white' : 'bg-primary-50 text-primary-700',
    success: 'bg-green-50 text-green-700',
    danger: 'bg-red-50 text-red-700',
    warning: 'bg-yellow-50 text-yellow-700',
    neutral: 'bg-ivory-muted text-ink-main',
  }[tone];
  return (
    <div className={`rounded-xl px-4 py-3 ${toneClasses}`}>
      <div className="text-xs opacity-75 mb-1">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

function PaymentSplit({ label, value, tone }: {
  label: string;
  value: string;
  tone: 'success' | 'primary' | 'warning';
}) {
  const dotTone = {
    success: 'bg-status-success',
    primary: 'bg-primary-600',
    warning: 'bg-status-warning',
  }[tone];
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${dotTone}`}></span>
      <div className="flex-1">
        <div className="text-xs text-ink-muted">{label}</div>
        <div className="text-sm font-bold tabular-nums text-ink-main">{value}</div>
      </div>
    </div>
  );
}
