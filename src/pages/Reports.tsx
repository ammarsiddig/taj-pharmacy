import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Toast from '../components/ui/Toast';
import SalesTab from './reports/SalesTab';
import InventoryTab from './reports/InventoryTab';
import ExpiryTab from './reports/ExpiryTab';
import ProfitLossTab from './reports/ProfitLossTab';
import SupplierAgingTab from './reports/SupplierAgingTab';
import CustomerCreditTab from './reports/CustomerCreditTab';
import BalanceSheetTab from './reports/BalanceSheetTab';
import TaxTab from './reports/TaxTab';

type Tab = 'sales' | 'inventory' | 'expiry' | 'profitLoss' | 'supplierAging' | 'customerCredit' | 'balanceSheet' | 'taxReport';

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
