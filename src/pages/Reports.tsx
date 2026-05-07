import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../api';
import type {
  SalesReport,
  SalesReportFilters,
  InventoryReport,
  ExpiryReport,
  ExpiryItem,
  ProfitLossReport,
  SupplierAgingReport,
  CustomerCreditReport,
  BalanceSheetSummary,
  AccountBalance,
  TaxReport,
} from '../types';
import Badge from '../components/ui/Badge';
import Toast from '../components/ui/Toast';
import { exportToCsv, moneyRaw } from '../utils/csv';

type Tab = 'sales' | 'inventory' | 'expiry' | 'profitLoss' | 'supplierAging' | 'customerCredit' | 'balanceSheet' | 'taxReport';

const BRANCH = api.getBranchId();

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function monthStartStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function Reports() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('sales');
  const [error, setError] = useState('');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'sales', label: t('reports.sales') },
    { key: 'inventory', label: t('reports.inventory') },
    { key: 'expiry', label: t('reports.expiry') },
    { key: 'profitLoss', label: t('reports.profitLoss') },
    { key: 'supplierAging', label: t('reports.supplierAging') },
    { key: 'customerCredit', label: t('reports.customerCredit') },
    { key: 'balanceSheet', label: t('reports.balanceSheetTab') },
    { key: 'taxReport', label: t('reports.taxReport') },
  ];

  return (
    <div className="space-y-4">
      {error && <Toast message={error} type="danger" onClose={() => setError('')} />}
      <div>
        <h2 className="text-2xl font-bold text-ink-main">{t('reports.title')}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t('reports.sales')}، {t('reports.inventory')}، {t('reports.balanceSheetTab')}</p>
      </div>

      {/* Tab selector */}
      <div className="app-panel flex flex-wrap gap-2 p-2">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              tab === tb.key
                ? 'bg-primary-600 text-white shadow-[var(--shadow-soft)]'
                : 'text-ink-muted hover:bg-surface-secondary hover:text-ink-main'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'sales' && <SalesTab onError={setError} />}
      {tab === 'inventory' && <InventoryTab onError={setError} />}
      {tab === 'expiry' && <ExpiryTab onError={setError} />}
      {tab === 'profitLoss' && <ProfitLossTab onError={setError} />}
      {tab === 'supplierAging' && <SupplierAgingTab onError={setError} />}
      {tab === 'customerCredit' && <CustomerCreditTab onError={setError} />}
      {tab === 'balanceSheet' && <BalanceSheetTab onError={setError} />}
      {tab === 'taxReport' && <TaxTab onError={setError} />}
    </div>
  );
}

/* ═══════════════════════════════════════
   SALES REPORT TAB
   ═══════════════════════════════════════ */

function SalesTab({ onError }: { onError: (e: string) => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(monthStartStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [groupBy, setGroupBy] = useState<SalesReportFilters['group_by']>('day');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getSalesReport(BRANCH, { date_from: dateFrom, date_to: dateTo, group_by: groupBy });
      setData(res);
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, groupBy, onError]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;
  if (!data) return <Empty />;

  const gp = data.gross_profit;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="sales-form-toolbar flex flex-wrap items-end gap-3">
        <Field label={t('reports.dateFrom')}>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="app-input px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
        </Field>
        <Field label={t('reports.dateTo')}>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="app-input px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
        </Field>
        <Field label={t('reports.groupBy')}>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as SalesReportFilters['group_by'])} className="app-input px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100">
            <option value="day">{t('reports.byDay')}</option>
            <option value="week">{t('reports.byWeek')}</option>
            <option value="month">{t('reports.byMonth')}</option>
            <option value="product">{t('reports.byProduct')}</option>
            <option value="cashier">{t('reports.byCashier')}</option>
          </select>
        </Field>
        <button onClick={load} className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-[var(--shadow-soft)] hover:bg-primary-700">
          {t('reports.refresh')}
        </button>
        {data && data.rows.length > 0 && (
          <button onClick={() => exportToCsv(`sales-report-${dateFrom}-${dateTo}`, data.rows.map(r => ({
            label: r.date || r.product_name || r.cashier_name || r.label,
            count: r.count ?? '',
            quantity: r.quantity ?? '',
            revenue: moneyRaw(r.revenue),
            profit: moneyRaw(r.profit ?? 0),
          })))}
            className="rounded-xl border border-ivory-border bg-white px-4 py-2.5 text-sm font-medium text-ink-main shadow-[var(--shadow-soft)] hover:bg-ivory-muted">
            {t('reports.exportCsv')}
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard label={t('reports.totalRevenue')} value={api.formatMoney(data.total_revenue)} />
        <SummaryCard label={t('reports.grossProfit')} value={api.formatMoney(gp)} accent={gp >= 0 ? 'green' : 'red'} />
        <SummaryCard label={t('reports.invoiceCount')} value={String(data.total_sales_count)} plain />
        <SummaryCard label={t('reports.avgInvoice')} value={api.formatMoney(data.avg_sale_value)} />
      </div>

      {/* Payment breakdown */}
      <div className="app-panel flex flex-wrap gap-4 p-4 text-sm">
        <span className="text-ink-muted">{t('reports.paymentBreakdown')}:</span>
        <span><strong className="text-ink-main">{t('reports.cashPayments')}</strong> {api.formatMoney(data.payment_breakdown.cash_total)} SDG</span>
        <span><strong className="text-ink-main">{t('reports.bankPayments')}</strong> {api.formatMoney(data.payment_breakdown.bank_transfer_total)} SDG</span>
        <span><strong className="text-ink-main">{t('reports.creditPayments')}</strong> {api.formatMoney(data.payment_breakdown.credit_total)} SDG</span>
      </div>

      {/* Data table */}
      {data.rows.length === 0 ? <Empty /> : (
        <div className="sales-form-table-wrap">
          <table className="sales-form-table">
            <thead>
              <tr className="bg-ivory-muted text-ink-muted border-b border-ivory-border">
                {groupBy === 'product' ? (
                  <>
                    <Th>{t('reports.product')}</Th>
                    <Th end>{t('reports.quantity')}</Th>
                    <Th end>{t('reports.revenue')}</Th>
                    <Th end>{t('reports.profit')}</Th>
                  </>
                ) : groupBy === 'cashier' ? (
                  <>
                    <Th>{t('reports.cashier')}</Th>
                    <Th end>{t('reports.count')}</Th>
                    <Th end>{t('reports.revenue')}</Th>
                  </>
                ) : (
                  <>
                    <Th>{t('reports.date')}</Th>
                    <Th end>{t('reports.count')}</Th>
                    <Th end>{t('reports.revenue')}</Th>
                    <Th end>{t('reports.profit')}</Th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i} className="border-b border-ivory-border last:border-0 hover:bg-ivory-muted/50">
                  {groupBy === 'product' ? (
                    <>
                      <Td>{r.product_name || r.label}</Td>
                      <Td end mono>{r.quantity}</Td>
                      <Td end mono>{api.formatMoney(r.revenue)}</Td>
                      <Td end mono>{api.formatMoney(r.profit)}</Td>
                    </>
                  ) : groupBy === 'cashier' ? (
                    <>
                      <Td>{r.cashier_name || r.label}</Td>
                      <Td end mono>{r.count}</Td>
                      <Td end mono>{api.formatMoney(r.revenue)}</Td>
                    </>
                  ) : (
                    <>
                      <Td>{r.date || r.label}</Td>
                      <Td end mono>{r.count}</Td>
                      <Td end mono>{api.formatMoney(r.revenue)}</Td>
                      <Td end mono>{api.formatMoney(r.profit)}</Td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   INVENTORY REPORT TAB
   ═══════════════════════════════════════ */

function InventoryTab({ onError }: { onError: (e: string) => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<InventoryReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getInventoryReport(BRANCH);
        setData(res);
      } catch (e: unknown) {
        onError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [onError]);

  if (loading) return <Loading />;
  if (!data) return <Empty />;

  const stockCost = data.total_stock_cost || data.total_stock_value;
  const potentialRevenue = data.total_potential_revenue || 0;
  const potentialGross = potentialRevenue - stockCost;
  const potentialMarginPct = potentialRevenue > 0 ? (potentialGross / potentialRevenue) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-5 gap-3">
        <SummaryCard label={t('reports.totalProducts')} value={String(data.total_products)} plain />
        <SummaryCard label={t('reports.stockValue')} value={api.formatMoney(stockCost)} />
        <SummaryCard label={t('reports.potentialRevenue')} value={api.formatMoney(potentialRevenue)} accent={potentialRevenue > stockCost ? 'green' : undefined} />
        <SummaryCard label={t('reports.potentialGrossProfit')} value={api.formatMoney(potentialGross)} accent={potentialGross >= 0 ? 'green' : 'red'} />
        <SummaryCard label={t('reports.lowStockItems')} value={String(data.low_stock_items.length)} accent={data.low_stock_items.length > 0 ? 'orange' : undefined} plain />
      </div>

      <div className="app-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-status-danger" />
            <span className="text-ink-muted">{t('reports.stockCostValue')}</span>
            <strong className="text-ink-main tabular-nums">{api.formatMoney(stockCost)} SDG</strong>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-status-success" />
            <span className="text-ink-muted">{t('reports.potentialRevenue')}</span>
            <strong className="text-ink-main tabular-nums">{api.formatMoney(potentialRevenue)} SDG</strong>
          </div>
          <div className="text-ink-muted">
            {t('reports.potentialMarginLabel')}: <strong className={potentialMarginPct >= 0 ? 'text-status-success tabular-nums' : 'text-status-danger tabular-nums'}>{potentialMarginPct.toFixed(1)}%</strong>
          </div>
        </div>
      </div>

      {/* Out of stock */}
      {data.out_of_stock_items.length > 0 && (
        <Section title={t('reports.outOfStockItems')} variant="danger">
          <table className="sales-form-table">
            <thead><tr className="text-ink-muted border-b border-ivory-border">
              <Th>{t('reports.product')}</Th>
              <Th end>{t('reports.minStock')}</Th>
            </tr></thead>
            <tbody>
              {data.out_of_stock_items.map((item, i) => (
                <tr key={i} className="border-b border-ivory-border last:border-0">
                  <Td>{item.product_name}</Td>
                  <Td end mono>{item.min_stock_level}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Low stock */}
      {data.low_stock_items.length > 0 && (
        <Section title={t('reports.lowStockItems')} variant="warning">
          <table className="sales-form-table">
            <thead><tr className="text-ink-muted border-b border-ivory-border">
              <Th>{t('reports.product')}</Th>
              <Th end>{t('reports.currentQty')}</Th>
              <Th end>{t('reports.minStock')}</Th>
            </tr></thead>
            <tbody>
              {data.low_stock_items.map((item, i) => (
                <tr key={i} className="border-b border-ivory-border last:border-0">
                  <Td>{item.product_name}</Td>
                  <Td end mono>{item.current_qty}</Td>
                  <Td end mono>{item.min_stock_level}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Dead stock */}
      {data.dead_stock_items.length > 0 && (
        <Section title={t('reports.deadStock')}>
          <table className="sales-form-table">
            <thead><tr className="text-ink-muted border-b border-ivory-border">
              <Th>{t('reports.product')}</Th>
              <Th end>{t('reports.quantity')}</Th>
              <Th end>{t('reports.value')}</Th>
              <Th end>{t('reports.lastMovement')}</Th>
            </tr></thead>
            <tbody>
              {data.dead_stock_items.map((item, i) => (
                <tr key={i} className="border-b border-ivory-border last:border-0">
                  <Td>{item.product_name}</Td>
                  <Td end mono>{item.current_qty}</Td>
                  <Td end mono>{api.formatMoney(item.stock_value)}</Td>
                  <Td end>{item.last_movement_date?.slice(0, 10) || '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* By location */}
      {data.by_location.length > 0 && (
        <Section title={t('reports.byLocation')}>
          <table className="sales-form-table">
            <thead><tr className="text-ink-muted border-b border-ivory-border">
              <Th>{t('reports.location')}</Th>
              <Th>{t('reports.locationType')}</Th>
              <Th end>{t('reports.productCount')}</Th>
              <Th end>{t('reports.totalQty')}</Th>
              <Th end>{t('reports.value')}</Th>
            </tr></thead>
            <tbody>
              {data.by_location.map((loc, i) => (
                <tr key={i} className="border-b border-ivory-border last:border-0">
                  <Td>{loc.location_name}</Td>
                  <Td>{loc.location_type}</Td>
                  <Td end mono>{loc.product_count}</Td>
                  <Td end mono>{loc.total_qty}</Td>
                  <Td end mono>{api.formatMoney(loc.total_value)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   EXPIRY REPORT TAB
   ═══════════════════════════════════════ */

function ExpiryTab({ onError }: { onError: (e: string) => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<ExpiryReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getExpiryReport(BRANCH);
        setData(res);
      } catch (e: unknown) {
        onError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [onError]);

  if (loading) return <Loading />;
  if (!data) return <Empty />;

  const sections: { key: string; label: string; items: ExpiryItem[]; variant: 'danger' | 'warning' | 'neutral' }[] = [
    { key: 'expired', label: t('reports.expiredItems'), items: data.expired, variant: 'danger' },
    { key: 'exp7', label: t('reports.expiringIn7'), items: data.expiring_7, variant: 'danger' },
    { key: 'exp30', label: t('reports.expiringIn30'), items: data.expiring_30, variant: 'warning' },
    { key: 'exp90', label: t('reports.expiringIn90'), items: [...data.expiring_60, ...data.expiring_90], variant: 'neutral' },
  ];

  const hasAny = sections.some((s) => s.items.length > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label={t('reports.totalAtRisk')} value={api.formatMoney(data.total_at_risk_value)} accent="red" />
        <SummaryCard
          label={t('reports.expiredItems')}
          value={String(data.expired.length)}
          accent={data.expired.length > 0 ? 'red' : undefined}
          plain
        />
      </div>

      {!hasAny ? <Empty /> : sections.map((sec) =>
        sec.items.length > 0 && (
          <Section key={sec.key} title={`${sec.label} (${sec.items.length})`} variant={sec.variant === 'neutral' ? undefined : sec.variant}>
            <ExpiryTable items={sec.items} />
          </Section>
        )
      )}
    </div>
  );
}

function ExpiryTable({ items }: { items: ExpiryItem[] }) {
  const { t } = useTranslation();
  return (
    <table className="sales-form-table">
      <thead>
        <tr className="text-ink-muted border-b border-ivory-border">
          <Th>{t('reports.product')}</Th>
          <Th>{t('reports.batch')}</Th>
          <Th>{t('reports.expiryDate')}</Th>
          <Th end>{t('reports.quantity')}</Th>
          <Th>{t('reports.location')}</Th>
          <Th end>{t('reports.value')}</Th>
          <Th end>{t('reports.daysRemaining')}</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => (
          <tr key={i} className="border-b border-ivory-border last:border-0">
            <Td>{item.product_name}</Td>
            <Td>{item.batch_number || '—'}</Td>
            <Td>{item.expiry_date?.slice(0, 10)}</Td>
            <Td end mono>{item.quantity_current}</Td>
            <Td>{item.location_name}</Td>
            <Td end mono>{api.formatMoney(item.stock_value)}</Td>
            <Td end>
              <span className={item.days_until_expiry < 0 ? 'text-status-danger font-bold' : item.days_until_expiry <= 7 ? 'text-status-danger' : item.days_until_expiry <= 30 ? 'text-status-warning' : 'text-ink-muted'}>
                {item.days_until_expiry}
              </span>
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ═══════════════════════════════════════
   PROFIT & LOSS REPORT TAB
   ═══════════════════════════════════════ */

function ProfitLossTab({ onError }: { onError: (e: string) => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<ProfitLossReport | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(monthStartStr());
  const [dateTo, setDateTo] = useState(todayStr());

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [plRes, bsRes] = await Promise.all([
        api.getProfitLossReport(BRANCH, dateFrom, dateTo),
        api.getBalanceSheetSummary(BRANCH),
      ]);
      setData(plRes);
      setBalanceSheet(bsRes);
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, onError]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;
  if (!data) return <Empty />;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="sales-form-toolbar flex gap-3 items-end flex-wrap">
        <Field label={t('reports.dateFrom')}>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-1.5 text-sm bg-ivory-surface border border-ivory-border rounded-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500" />
        </Field>
        <Field label={t('reports.dateTo')}>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-1.5 text-sm bg-ivory-surface border border-ivory-border rounded-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500" />
        </Field>
        <button onClick={load} className="px-4 py-1.5 text-sm bg-primary-600 text-white rounded-sm hover:bg-primary-700">
          {t('reports.refresh')}
        </button>
      </div>

      {/* Income Statement Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-ivory-surface border border-ivory-border rounded-sm p-4">
          <p className="text-sm text-ink-muted">{t('reports.netSales')}</p>
          <p className="text-2xl font-bold tabular-nums text-ink-main mt-1">{api.formatMoney(data.net_sales)}</p>
          <p className="text-xs text-ink-muted mt-0.5">SDG</p>
        </div>
        <div className="bg-ivory-surface border border-ivory-border rounded-sm p-4">
          <p className="text-sm text-ink-muted">{t('reports.grossProfit')}</p>
          <p className={`text-2xl font-bold tabular-nums mt-1 ${data.gross_profit >= 0 ? 'text-status-success' : 'text-status-danger'}`}>{api.formatMoney(data.gross_profit)}</p>
          <p className="text-sm text-ink-muted mt-0.5">{data.gross_margin.toFixed(1)}%</p>
        </div>
        <div className="bg-ivory-surface border border-ivory-border rounded-sm p-4">
          <p className="text-sm text-ink-muted">{t('reports.netProfit')}</p>
          <p className={`text-2xl font-bold tabular-nums mt-1 ${data.net_profit >= 0 ? 'text-status-success' : 'text-status-danger'}`}>{api.formatMoney(data.net_profit)}</p>
          <p className="text-sm text-ink-muted mt-0.5">{data.net_margin.toFixed(1)}%</p>
        </div>
        <div className="bg-ivory-surface border border-ivory-border rounded-sm p-4">
          <p className="text-sm text-ink-muted">{t('reports.expenses')}</p>
          <p className="text-2xl font-bold tabular-nums text-ink-main mt-1">{api.formatMoney(data.total_expenses)}</p>
          <p className="text-xs text-ink-muted mt-0.5">SDG</p>
        </div>
      </div>

      {/* P&L Statement */}
      <div className="bg-ivory-surface border border-ivory-border rounded-sm p-5 max-w-xl">
        <h3 className="text-base font-bold text-ink-main mb-4">{t('reports.profitLoss')}</h3>
        <div className="space-y-1 text-sm">
          <PLRow label={t('reports.grossSales')} value={data.gross_sales} />
          <PLRow label={`(-) ${t('reports.returns')}`} value={data.returns_total} negative />
          <PLRow label={t('reports.netSales')} value={data.net_sales} bold />
          <Divider />
          <PLRow label={`(-) ${t('reports.cogs')}`} value={data.cogs} negative />
          <PLRow label={t('reports.grossProfit')} value={data.gross_profit} bold highlight={data.gross_profit >= 0 ? 'green' : 'red'} />
          <PLRow label={t('reports.grossMargin')} pct={data.gross_margin} />
          <Divider />
          <PLRow label={`(-) ${t('reports.expenses')}`} value={data.total_expenses} negative />
          {data.expenses_by_category.map((ec, i) => (
            <PLRow key={i} label={`  \u2022 ${ec.category_name}`} value={ec.amount} sub />
          ))}
          <Divider />
          <PLRow label={t('reports.netProfit')} value={data.net_profit} bold highlight={data.net_profit >= 0 ? 'green' : 'red'} />
          <PLRow label={t('reports.netMargin')} pct={data.net_margin} />
        </div>
      </div>

      {/* Balance Sheet */}
      {balanceSheet && (
        <div className="bg-ivory-surface border border-ivory-border rounded-sm p-5 max-w-xl">
          <h3 className="text-base font-bold text-ink-main mb-4">{t('reports.balanceSheet')}</h3>
          <div className="space-y-0 text-sm">
            <p className="text-ink-muted text-xs font-bold uppercase tracking-wide mb-2">{t('reports.assets')}</p>
            <div className="flex justify-between py-1.5 border-b border-ivory-border">
              <span className="text-ink-muted">{t('reports.cashAndBank')}</span>
              <span className="tabular-nums">{api.formatMoney(balanceSheet.cash_and_bank)} SDG</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-ivory-border">
              <span className="text-ink-muted">{t('reports.inventoryValue')}</span>
              <span className="tabular-nums">{api.formatMoney(balanceSheet.inventory_value)} SDG</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-ivory-border">
              <span className="text-ink-muted">{t('reports.customerReceivables')}</span>
              <span className="tabular-nums">{api.formatMoney(balanceSheet.customer_receivables)} SDG</span>
            </div>
            <div className="border-t-2 border-ink-main mt-1" />
            <div className="flex justify-between py-1.5 font-bold text-ink-main">
              <span>{t('reports.totalAssets')}</span>
              <span className="tabular-nums">{api.formatMoney(balanceSheet.total_assets)} SDG</span>
            </div>

            <p className="text-ink-muted text-xs font-bold uppercase tracking-wide mt-4 mb-2">{t('reports.liabilities')}</p>
            <div className="flex justify-between py-1.5 border-b border-ivory-border">
              <span className="text-ink-muted">{t('reports.supplierPayables')}</span>
              <span className="tabular-nums">{api.formatMoney(balanceSheet.supplier_payables)} SDG</span>
            </div>
            <div className="border-t-2 border-ink-main mt-1" />
            <div className="flex justify-between py-1.5 font-bold text-ink-main">
              <span>{t('reports.totalLiabilities')}</span>
              <span className="tabular-nums">{api.formatMoney(balanceSheet.total_liabilities)} SDG</span>
            </div>

            <div className="border-t border-ivory-border mt-4 pt-3 flex justify-between items-center">
              <span className="text-base font-bold text-ink-main">{t('reports.netEquity')}</span>
              <span className={`tabular-nums text-lg font-bold ${
                balanceSheet.net_equity >= 0 ? 'text-status-success' : 'text-status-danger'
              }`}>
                {api.formatMoney(balanceSheet.net_equity)} SDG
              </span>
            </div>
            <p className="text-xs text-ink-muted mt-3">{t('reports.balanceSheetNote')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function PLRow({ label, value, pct, bold, negative, sub, highlight }: {
  label: string; value?: number; pct?: number; bold?: boolean; negative?: boolean; sub?: boolean;
  highlight?: 'green' | 'red';
}) {
  const cls = [
    'flex justify-between py-0.5',
    bold ? 'font-bold' : '',
    sub ? 'text-ink-muted text-xs' : '',
    highlight === 'green' ? 'text-status-success' : highlight === 'red' ? 'text-status-danger' : '',
  ].join(' ');

  return (
    <div className={cls}>
      <span className={negative ? 'text-ink-muted' : ''}>{label}</span>
      <span className="tabular-nums">
        {pct !== undefined ? `${pct.toFixed(1)}%` : value !== undefined ? `${api.formatMoney(value)} SDG` : ''}
      </span>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-ivory-border my-1" />;
}

/* ═══════════════════════════════════════
   SUPPLIER AGING TAB
   ═══════════════════════════════════════ */

function SupplierAgingTab({ onError }: { onError: (e: string) => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<SupplierAgingReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getSupplierAgingReport();
        setData(res);
      } catch (e: unknown) {
        onError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [onError]);

  if (loading) return <Loading />;
  if (!data) return <Empty />;

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <SummaryCard label={t('reports.totalPayables')} value={api.formatMoney(data.total_payables)} accent="red" />
        {data.rows.length > 0 && (
          <button onClick={() => exportToCsv('supplier-aging', data.rows.map(r => ({
            supplier: r.supplier_name, current: moneyRaw(r.current), '30_days': moneyRaw(r.days_30),
            '60_days': moneyRaw(r.days_60), '90+_days': moneyRaw(r.days_90_plus), total: moneyRaw(r.total),
          })))}
            className="px-4 py-1.5 text-sm bg-ivory-surface border border-ivory-border text-ink-main rounded-sm hover:bg-ivory-muted h-fit">
            {t('reports.exportCsv')}
          </button>
        )}
      </div>

      {data.rows.length === 0 ? <Empty /> : (
        <div className="sales-form-table-wrap">
          <table className="sales-form-table">
            <thead>
              <tr className="bg-ivory-muted text-ink-muted border-b border-ivory-border">
                <Th>{t('reports.supplier')}</Th>
                <Th end>{t('reports.current')}</Th>
                <Th end>{t('reports.days30')}</Th>
                <Th end>{t('reports.days60')}</Th>
                <Th end>{t('reports.days90plus')}</Th>
                <Th end>{t('reports.total')}</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i} className="border-b border-ivory-border last:border-0 hover:bg-ivory-muted/50">
                  <Td>{r.supplier_name}</Td>
                  <Td end mono>{api.formatMoney(r.current)}</Td>
                  <Td end mono className="text-status-warning">{r.days_30 > 0 ? api.formatMoney(r.days_30) : '—'}</Td>
                  <Td end mono className="text-status-danger">{r.days_60 > 0 ? api.formatMoney(r.days_60) : '—'}</Td>
                  <Td end mono className="text-status-danger font-bold">{r.days_90_plus > 0 ? api.formatMoney(r.days_90_plus) : '—'}</Td>
                  <Td end mono className="font-bold">{api.formatMoney(r.total)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   CUSTOMER CREDIT TAB
   ═══════════════════════════════════════ */

function CustomerCreditTab({ onError }: { onError: (e: string) => void }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<CustomerCreditReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getCustomerCreditReport();
        setData(res);
      } catch (e: unknown) {
        onError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [onError]);

  if (loading) return <Loading />;
  if (!data) return <Empty />;

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center flex-wrap">
        <SummaryCard label={t('reports.totalReceivables')} value={api.formatMoney(data.total_receivables)} />
        <SummaryCard label={t('reports.overLimitCount')} value={String(data.over_limit_count)} accent={data.over_limit_count > 0 ? 'red' : undefined} plain />
        {data.rows.length > 0 && (
          <button onClick={() => exportToCsv('customer-credit', data.rows.map(r => ({
            customer: r.customer_name, phone: r.phone || '', balance: moneyRaw(r.current_balance),
            credit_limit: moneyRaw(r.credit_limit), utilization_pct: r.utilization_pct.toFixed(1), status: r.status,
          })))}
            className="px-4 py-1.5 text-sm bg-ivory-surface border border-ivory-border text-ink-main rounded-sm hover:bg-ivory-muted h-fit">
            {t('reports.exportCsv')}
          </button>
        )}
      </div>

      {data.rows.length === 0 ? <Empty /> : (
        <div className="sales-form-table-wrap">
          <table className="sales-form-table">
            <thead>
              <tr className="bg-ivory-muted text-ink-muted border-b border-ivory-border">
                <Th>{t('reports.customer')}</Th>
                <Th>{t('reports.phone')}</Th>
                <Th end>{t('reports.balance')}</Th>
                <Th end>{t('reports.limit')}</Th>
                <Th end>{t('reports.utilization')}</Th>
                <Th>{t('reports.status')}</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i} className="border-b border-ivory-border last:border-0 hover:bg-ivory-muted/50">
                  <Td>{r.customer_name}</Td>
                  <Td>{r.phone || '—'}</Td>
                  <Td end mono>{api.formatMoney(r.current_balance)}</Td>
                  <Td end mono>{r.credit_limit > 0 ? api.formatMoney(r.credit_limit) : '—'}</Td>
                  <Td end>
                    {r.credit_limit > 0 ? (
                      <UtilizationBar pct={r.utilization_pct} rtl={i18n.dir() === 'rtl'} />
                    ) : (
                      <span className="tabular-nums">—</span>
                    )}
                  </Td>
                  <Td>
                    <Badge variant={r.status === 'over_limit' ? 'danger' : r.status === 'warning' ? 'warning' : 'success'}>
                      {r.status === 'over_limit' ? t('reports.statusOverLimit') : r.status === 'warning' ? t('reports.statusWarning') : t('reports.statusNormal')}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   BALANCE SHEET TAB
   ═══════════════════════════════════════ */

function BalanceSheetTab({ onError }: { onError: (e: string) => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<BalanceSheetSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getBalanceSheetSummary(BRANCH);
        setData(res);
      } catch (e: unknown) {
        onError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [onError]);

  if (loading) return <Loading />;
  if (!data) return <Empty />;

  const cashAccounts = data.accounts.filter((a: AccountBalance) => a.account_type === 'cash');
  const bankAccounts = data.accounts.filter((a: AccountBalance) => a.account_type === 'bank');

  return (
    <div className="space-y-4 max-w-2xl">
      {/* ASSETS */}
      <div className="bg-ivory-surface border border-ivory-border rounded-sm p-5">
        <p className="text-sm font-bold text-ink-muted uppercase tracking-wider mb-4">{t('reports.currentAssets')}</p>

        {/* Cash & Bank */}
        <p className="text-sm font-bold text-ink-muted uppercase tracking-wider mb-2 mt-2">{t('reports.cashAndBankDetail')}</p>
        {cashAccounts.map((a: AccountBalance, i: number) => (
          <div key={i} className="flex justify-between py-1 px-4 text-sm text-ink-muted">
            <span>{a.name_ar || a.name}</span>
            <span className="tabular-nums">{api.formatMoney(a.current_balance)} SDG</span>
          </div>
        ))}
        {bankAccounts.map((a: AccountBalance, i: number) => (
          <div key={i} className="flex justify-between py-1 px-4 text-sm text-ink-muted">
            <span>{a.name_ar || a.name}</span>
            <span className="tabular-nums">{api.formatMoney(a.current_balance)} SDG</span>
          </div>
        ))}
        <div className="flex justify-between py-2 font-semibold text-ink-main border-t border-ivory-border mt-1">
          <span>{t('reports.totalCash')}</span>
          <span className="tabular-nums">{api.formatMoney(data.cash_and_bank)} SDG</span>
        </div>

        {/* Receivables */}
        <div className="border-t border-ivory-border my-2" />
        <div className="flex justify-between py-2 text-ink-main">
          <span>{t('reports.customerReceivables')}</span>
          <span className="tabular-nums">{api.formatMoney(data.customer_receivables)} SDG</span>
        </div>

        {/* Inventory */}
        <div className="border-t border-ivory-border my-2" />
        <p className="text-sm font-bold text-ink-muted uppercase tracking-wider mb-2">{t('reports.inventoryAsset')}</p>
        <div className="flex justify-between py-2 text-ink-main">
          <span>{t('reports.inventoryCurrentValue')}</span>
          <span className="tabular-nums">{api.formatMoney(data.inventory_value)} SDG</span>
        </div>

        {/* Total Assets */}
        <div className="flex justify-between py-3 border-t-2 border-ink-main font-bold text-lg text-ink-main mt-2">
          <span>{t('reports.totalAssets')}</span>
          <span className="tabular-nums">{api.formatMoney(data.total_assets)} SDG</span>
        </div>
      </div>

      {/* LIABILITIES */}
      <div className="bg-ivory-surface border border-ivory-border rounded-sm p-5">
        <p className="text-sm font-bold text-ink-muted uppercase tracking-wider mb-4">{t('reports.currentLiabilities')}</p>

        <div className="flex justify-between py-2 text-ink-main">
          <span>{t('reports.supplierPayablesDetail')}</span>
          <span className="tabular-nums">{api.formatMoney(data.supplier_payables)} SDG</span>
        </div>

        {/* Total Liabilities */}
        <div className="flex justify-between py-3 border-t-2 border-ink-main font-bold text-lg text-ink-main mt-2">
          <span>{t('reports.totalLiabilities')}</span>
          <span className="tabular-nums">{api.formatMoney(data.total_liabilities)} SDG</span>
        </div>
      </div>

      {/* EQUITY */}
      <div className="bg-ivory-surface border border-ivory-border rounded-sm p-5">
        <p className="text-sm font-bold text-ink-muted uppercase tracking-wider mb-4">{t('reports.ownerEquity')}</p>
        <p className="text-xs text-ink-muted mb-3">{t('reports.netEquityFormula')}</p>

        <div className={`flex justify-between py-4 font-bold text-xl ${data.net_equity >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
          <span>{t('reports.netEquity')}</span>
          <span className="tabular-nums">{api.formatMoney(data.net_equity)} SDG</span>
        </div>

        <div className="border-t border-ivory-border my-2" />
        <p className="text-xs text-ink-muted mt-2">{t('reports.balanceSheetDisclaimer')}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   SHARED UI COMPONENTS
   ═══════════════════════════════════════ */

function Loading() {
  const { t } = useTranslation();
  return <div className="app-card py-8 text-center text-sm text-ink-muted">{t('common.loading')}</div>;
}

function Empty() {
  const { t } = useTranslation();
  return (
    <div className="app-card py-10 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-ivory-muted text-lg text-ink-muted">i</div>
      <p className="mt-3 text-sm font-medium text-ink-main">{t('reports.noData')}</p>
      <p className="mt-1 text-xs text-ink-muted">{t('reports.emptyTip')}</p>
    </div>
  );
}

function UtilizationBar({ pct, rtl }: { pct: number; rtl?: boolean }) {
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-ink-muted">{label}</label>
      {children}
    </div>
  );
}

function SummaryCard({ label, value, accent, plain }: {
  label: string; value: string; accent?: 'green' | 'red' | 'orange'; plain?: boolean;
}) {
  const color = accent === 'green' ? 'text-status-success' : accent === 'red' ? 'text-status-danger' : accent === 'orange' ? 'text-status-warning' : 'text-ink-main';
  return (
    <div className="app-card p-4">
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      <p className={`text-xl font-bold tabular-nums mt-0.5 ${color}`}>
        {value} {!plain && <span className="text-sm font-normal text-ink-muted">SDG</span>}
      </p>
    </div>
  );
}

function Section({ title, variant, children }: {
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

function Th({ children, end }: { children: React.ReactNode; end?: boolean }) {
  return <th className={`py-2 px-3 text-sm font-medium ${end ? 'text-end' : 'text-start'}`}>{children}</th>;
}

function Td({ children, end, mono, className = '' }: {
  children: React.ReactNode; end?: boolean; mono?: boolean; className?: string;
}) {
  return (
    <td className={`py-2 px-3 ${end ? 'text-end' : 'text-start'} ${mono ? 'tabular-nums' : ''} ${className}`}>
      {children}
    </td>
  );
}

/* ═══════════════════════════════════════
   TAX / VAT REPORT TAB
   ═══════════════════════════════════════ */

function TaxTab({ onError }: { onError: (e: string) => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<TaxReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(monthStartStr());
  const [dateTo, setDateTo] = useState(todayStr());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.getTaxReport(BRANCH, dateFrom, dateTo));
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, onError]);

  useEffect(() => { load(); }, [load]);

  const handleExport = () => {
    if (!data) return;
    exportToCsv(
      `tax-report-${dateFrom}-${dateTo}.csv`,
      data.rows.map(r => ({
        [t('reports.saleNumber')]: r.sale_number,
        [t('reports.saleType')]: r.sale_type === 'pos' ? t('reports.saleTypePos') : t('reports.saleTypeInvoice'),
        [t('reports.customer')]: r.customer_name || '',
        [t('reports.date')]: r.created_at.slice(0, 10),
        [t('reports.totalSubtotal')]: moneyRaw(r.subtotal),
        [t('reports.totalDiscount')]: moneyRaw(r.discount),
        [t('reports.totalTax')]: moneyRaw(r.tax_amount),
        [t('reports.total')]: moneyRaw(r.total),
      })),
    );
  };

  const inp = 'app-input px-3 py-2 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100';

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="app-panel flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="block text-xs text-ink-muted mb-1">{t('reports.dateFrom')}</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inp} />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">{t('reports.dateTo')}</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inp} />
        </div>
        <button onClick={load} className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
          {t('reports.refresh')}
        </button>
        {data && (
          <button onClick={handleExport} className="ms-auto rounded-xl border border-ivory-border bg-white px-4 py-2 text-sm font-medium text-ink-muted hover:bg-ivory-muted">
            {t('reports.exportCsv')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="app-card py-12 text-center text-sm text-ink-muted">{t('common.loading')}</div>
      ) : !data || data.rows.length === 0 ? (
        <div className="app-card py-12 text-center text-sm text-ink-muted">{t('reports.noTaxData')}</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <SummaryCard label={t('reports.totalSubtotal')} value={api.formatMoney(data.total_subtotal)} />
            <SummaryCard label={t('reports.totalDiscount')} value={api.formatMoney(data.total_discount)} accent="orange" />
            <SummaryCard label={t('reports.totalTax')} value={api.formatMoney(data.total_tax)} accent="red" />
            <SummaryCard label={t('reports.totalNet')} value={api.formatMoney(data.total_net)} accent="green" />
            <SummaryCard label={t('reports.taxableSales')} value={String(data.taxable_sales_count)} plain />
            <SummaryCard label={t('reports.exemptSales')} value={String(data.exempt_sales_count)} plain />
          </div>

          {/* Detail table */}
          <div className="app-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="sales-form-table w-full text-sm">
                <thead>
                  <tr className="bg-ivory-muted text-ink-muted border-b border-ivory-border">
                    <Th>{t('reports.saleNumber')}</Th>
                    <Th>{t('reports.saleType')}</Th>
                    <Th>{t('reports.customer')}</Th>
                    <Th>{t('reports.date')}</Th>
                    <Th end>{t('reports.totalSubtotal')}</Th>
                    <Th end>{t('reports.totalDiscount')}</Th>
                    <Th end>{t('reports.totalTax')}</Th>
                    <Th end>{t('reports.total')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(row => (
                    <tr key={row.sale_number} className="border-b border-ivory-border hover:bg-ivory-muted">
                      <Td><span className="font-medium text-ink-main">{row.sale_number}</span></Td>
                      <Td>
                        <Badge variant={row.sale_type === 'pos' ? 'success' : 'neutral'}>
                          {row.sale_type === 'pos' ? t('reports.saleTypePos') : t('reports.saleTypeInvoice')}
                        </Badge>
                      </Td>
                      <Td>{row.customer_name || '—'}</Td>
                      <Td>{row.created_at.slice(0, 10)}</Td>
                      <Td end mono>{api.formatMoney(row.subtotal)}</Td>
                      <Td end mono className={row.discount > 0 ? 'text-status-warning' : ''}>
                        {row.discount > 0 ? `−${api.formatMoney(row.discount)}` : '—'}
                      </Td>
                      <Td end mono className={row.tax_amount > 0 ? 'text-status-danger' : 'text-ink-placeholder'}>
                        {row.tax_amount > 0 ? api.formatMoney(row.tax_amount) : '—'}
                      </Td>
                      <Td end mono className="font-bold">{api.formatMoney(row.total)}</Td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ivory-border bg-ivory-muted font-bold text-ink-main">
                    <td colSpan={4} className="py-2 px-3 text-start">{t('reports.total')}</td>
                    <Td end mono>{api.formatMoney(data.total_subtotal)}</Td>
                    <Td end mono className="text-status-warning">
                      {data.total_discount > 0 ? `−${api.formatMoney(data.total_discount)}` : '—'}
                    </Td>
                    <Td end mono className="text-status-danger">{api.formatMoney(data.total_tax)}</Td>
                    <Td end mono>{api.formatMoney(data.total_net)}</Td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
