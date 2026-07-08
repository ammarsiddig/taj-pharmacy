import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../../api';
import type { TaxReport } from '../../types';
import Badge from '../../components/ui/Badge';
import { exportToCsv, moneyRaw } from '../../utils/csv';
import { SummaryCard, Th, Td, todayStr, monthStartStr } from './ReportShared';

export default function TaxTab({ onError }: { onError: (e: string) => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<TaxReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(monthStartStr());
  const [dateTo, setDateTo] = useState(todayStr());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.getTaxReport(api.getBranchId(), dateFrom, dateTo));
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
