import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../../api';
import type { ProfitLossReport, BalanceSheetSummary } from '../../types';
import { Loading, Empty, Field, todayStr, monthStartStr } from './ReportShared';

export default function ProfitLossTab({ onError }: { onError: (e: string) => void }) {
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
        api.getProfitLossReport(api.getBranchId(), dateFrom, dateTo),
        api.getBalanceSheetSummary(api.getBranchId()),
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
          <p className="text-xs text-ink-muted mt-0.5">{t('common.currency')}</p>
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
          <p className="text-xs text-ink-muted mt-0.5">{t('common.currency')}</p>
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
              <span className="tabular-nums">{api.formatMoney(balanceSheet.cash_and_bank)} {t('common.currency')}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-ivory-border">
              <span className="text-ink-muted">{t('reports.inventoryValue')}</span>
              <span className="tabular-nums">{api.formatMoney(balanceSheet.inventory_value)} {t('common.currency')}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-ivory-border">
              <span className="text-ink-muted">{t('reports.customerReceivables')}</span>
              <span className="tabular-nums">{api.formatMoney(balanceSheet.customer_receivables)} {t('common.currency')}</span>
            </div>
            <div className="border-t-2 border-ink-main mt-1" />
            <div className="flex justify-between py-1.5 font-bold text-ink-main">
              <span>{t('reports.totalAssets')}</span>
              <span className="tabular-nums">{api.formatMoney(balanceSheet.total_assets)} {t('common.currency')}</span>
            </div>

            <p className="text-ink-muted text-xs font-bold uppercase tracking-wide mt-4 mb-2">{t('reports.liabilities')}</p>
            <div className="flex justify-between py-1.5 border-b border-ivory-border">
              <span className="text-ink-muted">{t('reports.supplierPayables')}</span>
              <span className="tabular-nums">{api.formatMoney(balanceSheet.supplier_payables)} {t('common.currency')}</span>
            </div>
            <div className="border-t-2 border-ink-main mt-1" />
            <div className="flex justify-between py-1.5 font-bold text-ink-main">
              <span>{t('reports.totalLiabilities')}</span>
              <span className="tabular-nums">{api.formatMoney(balanceSheet.total_liabilities)} {t('common.currency')}</span>
            </div>

            <div className="border-t border-ivory-border mt-4 pt-3 flex justify-between items-center">
              <span className="text-base font-bold text-ink-main">{t('reports.netEquity')}</span>
              <span className={`tabular-nums text-lg font-bold ${
                balanceSheet.net_equity >= 0 ? 'text-status-success' : 'text-status-danger'
              }`}>
                {api.formatMoney(balanceSheet.net_equity)} {t('common.currency')}
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
  const { t } = useTranslation();
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
        {pct !== undefined ? `${pct.toFixed(1)}%` : value !== undefined ? `${api.formatMoney(value)} ${t('common.currency')}` : ''}
      </span>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-ivory-border my-1" />;
}
