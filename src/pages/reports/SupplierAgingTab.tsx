import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../../api';
import type { SupplierAgingReport } from '../../types';
import { exportToCsv, moneyRaw } from '../../utils/csv';
import { Loading, Empty, SummaryCard, Th, Td } from './ReportShared';

export default function SupplierAgingTab({ onError }: { onError: (e: string) => void }) {
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
