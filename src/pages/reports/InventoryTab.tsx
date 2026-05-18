import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../../api';
import type { InventoryReport } from '../../types';
import { Loading, Empty, SummaryCard, Section, Th, Td } from './ReportShared';

const BRANCH = api.getBranchId();

export default function InventoryTab({ onError }: { onError: (e: string) => void }) {
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
            <strong className="text-ink-main tabular-nums">{api.formatMoney(stockCost)} {t('common.currency')}</strong>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-status-success" />
            <span className="text-ink-muted">{t('reports.potentialRevenue')}</span>
            <strong className="text-ink-main tabular-nums">{api.formatMoney(potentialRevenue)} {t('common.currency')}</strong>
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
