import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../../api';
import type { CustomerCreditReport } from '../../types';
import Badge from '../../components/ui/Badge';
import { exportToCsv, moneyRaw } from '../../utils/csv';
import { Loading, Empty, SummaryCard, Th, Td, UtilizationBar } from './ReportShared';

export default function CustomerCreditTab({ onError }: { onError: (e: string) => void }) {
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
