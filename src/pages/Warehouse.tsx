import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Warehouse as WarehouseIcon, Move3D, Undo2, ArrowLeftRight, PackageSearch, AlertTriangle } from 'lucide-react';
import { getBranchId } from '../api';
import { TabButton } from './warehouse/WarehouseShared';
import MovementsTab from './warehouse/MovementsTab';
import SupplierReturnsTab from './warehouse/SupplierReturnsTab';
import TransferTab from './warehouse/TransferTab';
import InventoryTab from './warehouse/InventoryTab';
import ReorderAlertsTab from './warehouse/ReorderAlertsTab';

type Tab = 'movements' | 'returns' | 'transfer' | 'inventory' | 'reorder';

export default function Warehouse() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('movements');
  const branchId = getBranchId();

  const tabs: { key: Tab; label: string }[] = [
    { key: 'movements', label: t('warehouse.tabs.movements') },
    { key: 'inventory', label: t('warehouse.tabs.inventory') },
    { key: 'transfer', label: t('warehouse.tabs.transfer') },
    { key: 'returns', label: t('warehouse.tabs.supplierReturns') },
    { key: 'reorder', label: t('warehouse.tabs.reorder') },
  ];

  return (
    <div className="flex h-full flex-col gap-5 p-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
          <WarehouseIcon size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ink-main">{t('warehouse.title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('warehouse.subtitle')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map(tab => (
          <TabButton
            key={tab.key}
            active={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            icon={
              tab.key === 'movements' ? <Move3D size={15} /> :
              tab.key === 'inventory' ? <PackageSearch size={15} /> :
              tab.key === 'transfer' ? <ArrowLeftRight size={15} /> :
              tab.key === 'reorder' ? <AlertTriangle size={15} /> :
              <Undo2 size={15} />
            }
          >
            {tab.label}
          </TabButton>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'movements' && <MovementsTab branchId={branchId} />}
        {activeTab === 'returns' && <SupplierReturnsTab branchId={branchId} />}
        {activeTab === 'transfer' && <TransferTab branchId={branchId} />}
        {activeTab === 'inventory' && <InventoryTab branchId={branchId} />}
        {activeTab === 'reorder' && <ReorderAlertsTab branchId={branchId} />}
      </div>
    </div>
  );
}
