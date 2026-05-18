import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../../api';
import type { SalesReport, SalesReportFilters } from '../../types';
import { exportToCsv, moneyRaw } from '../../utils/csv';
import { Loading, Empty, Field, SummaryCard, Th, Td, todayStr, monthStartStr } from './ReportShared';

const BRANCH = api.getBranchId();

export default function SalesTab({ onError }: { onError: (e: string) => void }) {
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
        <span><strong className="text-ink-main">{t('reports.cashPayments')}</strong> {api.formatMoney(data.payment_breakdown.cash_total)} {t('common.currency')}</span>
        <span><strong className="text-ink-main">{t('reports.bankPayments')}</strong> {api.formatMoney(data.payment_breakdown.bank_transfer_total)} {t('common.currency')}</span>
        <span><strong className="text-ink-main">{t('reports.creditPayments')}</strong> {api.formatMoney(data.payment_breakdown.credit_total)} {t('common.currency')}</span>
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
