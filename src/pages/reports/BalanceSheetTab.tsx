import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../../api';
import type { BalanceSheetSummary, AccountBalance } from '../../types';
import { Loading, Empty } from './ReportShared';

const BRANCH = api.getBranchId();

export default function BalanceSheetTab({ onError }: { onError: (e: string) => void }) {
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
            <span className="tabular-nums">{api.formatMoney(a.current_balance)} {t('common.currency')}</span>
          </div>
        ))}
        {bankAccounts.map((a: AccountBalance, i: number) => (
          <div key={i} className="flex justify-between py-1 px-4 text-sm text-ink-muted">
            <span>{a.name_ar || a.name}</span>
            <span className="tabular-nums">{api.formatMoney(a.current_balance)} {t('common.currency')}</span>
          </div>
        ))}
        <div className="flex justify-between py-2 font-semibold text-ink-main border-t border-ivory-border mt-1">
          <span>{t('reports.totalCash')}</span>
          <span className="tabular-nums">{api.formatMoney(data.cash_and_bank)} {t('common.currency')}</span>
        </div>

        {/* Receivables */}
        <div className="border-t border-ivory-border my-2" />
        <div className="flex justify-between py-2 text-ink-main">
          <span>{t('reports.customerReceivables')}</span>
          <span className="tabular-nums">{api.formatMoney(data.customer_receivables)} {t('common.currency')}</span>
        </div>

        {/* Inventory */}
        <div className="border-t border-ivory-border my-2" />
        <p className="text-sm font-bold text-ink-muted uppercase tracking-wider mb-2">{t('reports.inventoryAsset')}</p>
        <div className="flex justify-between py-2 text-ink-main">
          <span>{t('reports.inventoryCurrentValue')}</span>
          <span className="tabular-nums">{api.formatMoney(data.inventory_value)} {t('common.currency')}</span>
        </div>

        {/* Total Assets */}
        <div className="flex justify-between py-3 border-t-2 border-ink-main font-bold text-lg text-ink-main mt-2">
          <span>{t('reports.totalAssets')}</span>
          <span className="tabular-nums">{api.formatMoney(data.total_assets)} {t('common.currency')}</span>
        </div>
      </div>

      {/* LIABILITIES */}
      <div className="bg-ivory-surface border border-ivory-border rounded-sm p-5">
        <p className="text-sm font-bold text-ink-muted uppercase tracking-wider mb-4">{t('reports.currentLiabilities')}</p>

        <div className="flex justify-between py-2 text-ink-main">
          <span>{t('reports.supplierPayablesDetail')}</span>
          <span className="tabular-nums">{api.formatMoney(data.supplier_payables)} {t('common.currency')}</span>
        </div>

        {/* Total Liabilities */}
        <div className="flex justify-between py-3 border-t-2 border-ink-main font-bold text-lg text-ink-main mt-2">
          <span>{t('reports.totalLiabilities')}</span>
          <span className="tabular-nums">{api.formatMoney(data.total_liabilities)} {t('common.currency')}</span>
        </div>
      </div>

      {/* EQUITY */}
      <div className="bg-ivory-surface border border-ivory-border rounded-sm p-5">
        <p className="text-sm font-bold text-ink-muted uppercase tracking-wider mb-4">{t('reports.ownerEquity')}</p>
        <p className="text-xs text-ink-muted mb-3">{t('reports.netEquityFormula')}</p>

        <div className={`flex justify-between py-4 font-bold text-xl ${data.net_equity >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
          <span>{t('reports.netEquity')}</span>
          <span className="tabular-nums">{api.formatMoney(data.net_equity)} {t('common.currency')}</span>
        </div>

        <div className="border-t border-ivory-border my-2" />
        <p className="text-xs text-ink-muted mt-2">{t('reports.balanceSheetDisclaimer')}</p>
      </div>
    </div>
  );
}
