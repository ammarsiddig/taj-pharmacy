import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../../api';
import type { ExpiryReport, ExpiryItem } from '../../types';
import { Loading, Empty, SummaryCard, Section, Th, Td } from './ReportShared';

export default function ExpiryTab({ onError }: { onError: (e: string) => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<ExpiryReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getExpiryReport(api.getBranchId());
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
