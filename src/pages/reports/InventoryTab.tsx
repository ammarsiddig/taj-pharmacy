import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../../api';
import type { InventoryReport } from '../../types';
import { Loading, Empty, SummaryCard, Section, Th, Td } from './ReportShared';

const PAGE_SIZE = 20;

export default function InventoryTab({ onError }: { onError: (e: string) => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<InventoryReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getInventoryReport(api.getBranchId());
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
  const showMargin = stockCost > 0 && potentialRevenue > 0 && data.zero_cost_items === 0;

  return (
    <div className="space-y-4">
      {/* KPIs — headline is stock value + actionable reorder count, not catalog noise */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label={t('reports.stockValue')} value={api.formatMoney(stockCost)} />
        <SummaryCard label={t('reports.stockedProducts')} value={String(data.stocked_products)} plain />
        <SummaryCard label={t('reports.reorderNeeded')} value={String(data.reorder_count)} accent={data.reorder_count > 0 ? 'orange' : undefined} plain />
        <SummaryCard label={t('reports.neverStockedItems')} value={String(data.never_stocked_count)} plain />
      </div>

      {/* Value / margin strip — only trust the margin when costs are complete */}
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
          {showMargin && (
            <div className="text-ink-muted">
              {t('reports.potentialMarginLabel')}: <strong className={potentialMarginPct >= 0 ? 'text-status-success tabular-nums' : 'text-status-danger tabular-nums'}>{potentialMarginPct.toFixed(1)}%</strong>
            </div>
          )}
        </div>
        {data.zero_cost_items > 0 && (
          <p className="mt-2 rounded-lg bg-status-warning-bg px-3 py-2 text-xs text-[#D97706]">
            {t('reports.zeroCostWarning', { count: data.zero_cost_items })}
          </p>
        )}
        {data.never_stocked_count > 0 && (
          <p className="mt-2 text-xs text-ink-muted">
            {t('reports.neverStockedNote', { count: data.never_stocked_count })}
          </p>
        )}
      </div>

      {/* Out of stock (genuinely depleted) */}
      {data.out_of_stock_items.length > 0 && (
        <PaginatedSection title={t('reports.outOfStockItems')} variant="danger" total={data.out_of_stock_items.length} t={t}>
          {(limit) => (
            <table className="sales-form-table">
              <thead><tr className="text-ink-muted border-b border-ivory-border">
                <Th>{t('reports.product')}</Th>
                <Th end>{t('reports.minStock')}</Th>
              </tr></thead>
              <tbody>
                {data.out_of_stock_items.slice(0, limit).map((item, i) => (
                  <tr key={i} className="border-b border-ivory-border last:border-0">
                    <Td>{item.product_name}</Td>
                    <Td end mono>{item.min_stock_level}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PaginatedSection>
      )}

      {/* Low stock */}
      {data.low_stock_items.length > 0 && (
        <PaginatedSection title={t('reports.lowStockItems')} variant="warning" total={data.low_stock_items.length} t={t}>
          {(limit) => (
            <table className="sales-form-table">
              <thead><tr className="text-ink-muted border-b border-ivory-border">
                <Th>{t('reports.product')}</Th>
                <Th end>{t('reports.currentQty')}</Th>
                <Th end>{t('reports.minStock')}</Th>
              </tr></thead>
              <tbody>
                {data.low_stock_items.slice(0, limit).map((item, i) => (
                  <tr key={i} className="border-b border-ivory-border last:border-0">
                    <Td>{item.product_name}</Td>
                    <Td end mono>{item.current_qty}</Td>
                    <Td end mono>{item.min_stock_level}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PaginatedSection>
      )}

      {/* Dead stock */}
      {data.dead_stock_items.length > 0 && (
        <PaginatedSection title={t('reports.deadStock')} total={data.dead_stock_items.length} t={t}>
          {(limit) => (
            <table className="sales-form-table">
              <thead><tr className="text-ink-muted border-b border-ivory-border">
                <Th>{t('reports.product')}</Th>
                <Th end>{t('reports.quantity')}</Th>
                <Th end>{t('reports.value')}</Th>
                <Th end>{t('reports.lastMovement')}</Th>
              </tr></thead>
              <tbody>
                {data.dead_stock_items.slice(0, limit).map((item, i) => (
                  <tr key={i} className="border-b border-ivory-border last:border-0">
                    <Td>{item.product_name}</Td>
                    <Td end mono>{item.current_qty}</Td>
                    <Td end mono>{api.formatMoney(item.stock_value)}</Td>
                    <Td end>{item.last_movement_date?.slice(0, 10) || '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PaginatedSection>
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

function PaginatedSection({
  title, variant, total, t, children,
}: {
  title: string;
  variant?: 'danger' | 'warning';
  total: number;
  t: (key: string, opts?: Record<string, unknown>) => string;
  children: (limit: number) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const limit = expanded ? total : PAGE_SIZE;
  return (
    <Section title={`${title} (${total})`} variant={variant}>
      {children(limit)}
      {total > PAGE_SIZE && (
        <div className="pt-2 text-center">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-medium text-primary-600 hover:underline"
          >
            {expanded ? t('reports.showLess') : t('reports.showAll', { count: total })}
          </button>
        </div>
      )}
    </Section>
  );
}
