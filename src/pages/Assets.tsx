import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getAssets, getAssetCategories, createAsset, updateAsset, disposeAsset,
  getDepreciationEntries, runDepreciation, getAssetsSummary,
  getBranchId,
} from '../api';
import type {
  AssetRow, AssetData, AssetCategory,
  DepreciationEntry, DepreciationRunResult, AssetSummary,
} from '../types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import NumericInput from '../components/ui/NumericInput';
import Toast from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';

function fmt(piasters: number) {
  return (piasters / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-4 py-2.5 text-sm font-medium border transition-colors ${
        active
          ? 'border-primary-600 text-primary-600 bg-white shadow-[var(--shadow-soft)]'
          : 'border-ivory-border text-ink-muted bg-ivory-muted hover:text-ink-main hover:bg-white'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Tab 1: Register ────────────────────────────────────────────────────────

function RegisterTab() {
  const { t } = useTranslation();
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAsset, setEditingAsset] = useState<AssetRow | null>(null);
  const [disposing, setDisposing] = useState<{ asset: AssetRow | null; method: 'disposed' | 'written_off'; date: string; value: number }>(
    { asset: null, method: 'disposed', date: new Date().toISOString().split('T')[0], value: 0 }
  );
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const [form, setForm] = useState<AssetData>({
    category_id: '',
    name: '',
    asset_code: '',
    serial_number: '',
    purchase_date: '',
    purchase_cost: 0,
    salvage_value: 0,
    useful_life_years: 5,
    depreciation_method: 'straight_line',
    notes: '',
    branch_id: '',
  });
  const branchId = getBranchId();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ass, cats] = await Promise.all([
        getAssets(branchId),
        getAssetCategories(),
      ]);
      setAssets(ass);
      setCategories(cats);
    } catch (e: unknown) {
      setToast({ msg: String(e), type: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = () => {
    setForm({
      category_id: '',
      name: '',
      asset_code: '',
      serial_number: '',
      purchase_date: '',
      purchase_cost: 0,
      salvage_value: 0,
      useful_life_years: 5,
      depreciation_method: 'straight_line',
      notes: '',
      branch_id: branchId,
    });
    setEditingAsset(null);
    setShowForm(true);
  };

  const handleEdit = (asset: AssetRow) => {
    setForm({
      category_id: asset.category_id || '',
      name: asset.name,
      asset_code: asset.asset_code || '',
      serial_number: asset.serial_number || '',
      purchase_date: asset.purchase_date,
      purchase_cost: asset.purchase_cost,
      salvage_value: asset.salvage_value,
      useful_life_years: asset.useful_life_years,
      depreciation_method: asset.depreciation_method,
      notes: asset.notes || '',
      branch_id: branchId,
    });
    setEditingAsset(asset);
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      if (editingAsset) {
        await updateAsset(editingAsset.id, form);
      } else {
        await createAsset(form);
      }
      setShowForm(false);
      setEditingAsset(null);
      setToast({ msg: t('common.save'), type: 'success' });
      load();
    } catch (err) {
      setToast({ msg: String(err), type: 'danger' });
    }
  };

  const handleConfirmDispose = async () => {
    if (!disposing.asset) return;
    try {
      await disposeAsset(disposing.asset.id, {
        disposal_date: disposing.date,
        disposal_value: disposing.value,
        write_off: disposing.method === 'written_off',
      });
      setDisposing({ asset: null, method: 'disposed', date: new Date().toISOString().split('T')[0], value: 0 });
      setToast({ msg: t('common.save'), type: 'success' });
      load();
    } catch (err) {
      setToast({ msg: String(err), type: 'danger' });
    }
  };

  if (loading) return <div className="text-center py-8">{t('common.loading')}</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">{t('assets.register')}</h3>
        <Button onClick={handleAdd} variant="primary">{t('common.add')}</Button>
      </div>

      <div className="bg-white rounded-lg border border-ivory-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ivory-100 border-b border-ivory-border">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">{t('assets.name')}</th>
              <th className="px-4 py-3 text-left font-semibold">{t('assets.category')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('assets.purchaseCost')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('assets.nbv')}</th>
              <th className="px-4 py-3 text-left font-semibold">{t('assets.status')}</th>
              <th className="px-4 py-3 text-center font-semibold">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr key={asset.id} className="border-b border-ivory-border hover:bg-ivory-50">
                <td className="px-4 py-3">{asset.name}</td>
                <td className="px-4 py-3">{asset.category_name}</td>
                <td className="px-4 py-3 text-right">{fmt(asset.purchase_cost)}</td>
                <td className="px-4 py-3 text-right">{fmt(asset.current_nbv)}</td>
                <td className="px-4 py-3">
                  <Badge variant={asset.status === 'active' ? 'success' : 'danger'}>
                    {asset.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-center space-x-2">
                  <button
                    onClick={() => handleEdit(asset)}
                    className="text-primary-600 hover:underline text-xs"
                  >
                    {t('common.edit')}
                  </button>
                  {asset.status === 'active' && (
                    <button
                      onClick={() => setDisposing({ ...disposing, asset })}
                      className="text-red-600 hover:underline text-xs"
                    >
                      {t('assets.dispose')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Form Panel */}
      {showForm && (
        <div className="bg-white rounded-lg border border-ivory-border p-4 space-y-3">
          <h4 className="font-semibold">{editingAsset ? t('common.edit') : t('common.add')}</h4>
          <Select
            label={t('assets.category')}
            value={form.category_id}
            onChange={(e) => setForm({ ...form, category_id: e.currentTarget.value })}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
          />
          <Input
            label={t('assets.name')}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
          />
          <Input
            label={t('assets.assetCode')}
            value={form.asset_code}
            onChange={(e) => setForm({ ...form, asset_code: e.currentTarget.value })}
          />
          <Input
            label={t('assets.serialNumber')}
            value={form.serial_number}
            onChange={(e) => setForm({ ...form, serial_number: e.currentTarget.value })}
          />
          <Input
            label={t('common.date')}
            type="date"
            value={form.purchase_date}
            onChange={(e) => setForm({ ...form, purchase_date: e.currentTarget.value })}
          />
          <NumericInput
            label={t('assets.purchaseCost')}
            value={form.purchase_cost}
            onChange={(v) => setForm({ ...form, purchase_cost: v })}
          />
          <NumericInput
            label={t('assets.salvageValue')}
            value={form.salvage_value}
            onChange={(v) => setForm({ ...form, salvage_value: v })}
          />
          <NumericInput
            label={t('assets.usefulLifeYears')}
            value={form.useful_life_years}
            onChange={(v) => setForm({ ...form, useful_life_years: v })}
          />
          <Select
            label={t('assets.depreciationMethod')}
            value={form.depreciation_method}
            onChange={(e) => setForm({ ...form, depreciation_method: e.currentTarget.value as 'straight_line' | 'declining_balance' })}
            options={[
              { value: 'straight_line', label: t('assets.straightLine') },
              { value: 'declining_balance', label: t('assets.decliningBalance') },
            ]}
          />
          <Input
            label={t('common.notes')}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })}
          />
          <div className="flex gap-3 pt-2">
            <Button onClick={() => setShowForm(false)} variant="secondary">{t('common.cancel')}</Button>
            <Button onClick={handleSave} variant="primary">{t('common.save')}</Button>
          </div>
        </div>
      )}

      {/* Dispose Confirmation */}
      <Modal
        open={!!disposing.asset}
        title={t('assets.dispose')}
        message={`${t('assets.disposeConfirm')}: ${disposing.asset?.name}`}
        onConfirm={handleConfirmDispose}
        onCancel={() => setDisposing({ asset: null, method: 'disposed', date: new Date().toISOString().split('T')[0], value: 0 })}
        variant="danger"
      />

      {toast && (
        <Toast
          message={toast.msg}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

// ─── Tab 2: Depreciation Schedule ───────────────────────────────────────────

function ScheduleTab() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<DepreciationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [assetFilter, setAssetFilter] = useState('');
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString());
  const [assets, setAssets] = useState<AssetRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ents, asts] = await Promise.all([
        getDepreciationEntries(assetFilter || undefined, yearFilter ? parseInt(yearFilter) : undefined),
        getAssets(),
      ]);
      setEntries(ents);
      setAssets(asts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [assetFilter, yearFilter]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-center py-8">{t('common.loading')}</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Select
          label={t('assets.asset')}
          value={assetFilter}
          onChange={(e) => setAssetFilter(e.currentTarget.value)}
          options={[
            { value: '', label: t('common.all') },
            ...assets.map((a) => ({ value: a.id, label: a.name })),
          ]}
        />
        <Input
          label={t('common.year')}
          type="number"
          value={yearFilter}
          onChange={(e) => setYearFilter(e.currentTarget.value)}
        />
      </div>

      <div className="bg-white rounded-lg border border-ivory-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ivory-100 border-b border-ivory-border">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">{t('assets.asset')}</th>
              <th className="px-4 py-3 text-center font-semibold">{t('assets.period')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('assets.openingNbv')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('assets.depreciation')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('assets.closingNbv')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-ivory-border hover:bg-ivory-50">
                <td className="px-4 py-3">{entry.asset_name}</td>
                <td className="px-4 py-3 text-center">{entry.period_year}-{String(entry.period_month).padStart(2, '0')}</td>
                <td className="px-4 py-3 text-right">{fmt(entry.opening_nbv)}</td>
                <td className="px-4 py-3 text-right">{fmt(entry.depreciation)}</td>
                <td className="px-4 py-3 text-right">{fmt(entry.closing_nbv)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab 3: Run Depreciation ────────────────────────────────────────────────

function RunTab() {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  });
  const [result, setResult] = useState<DepreciationRunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRun = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await runDepreciation(form.year, form.month);
      setResult(res);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <NumericInput
          label={t('common.year')}
          value={form.year}
          onChange={(v) => setForm({ ...form, year: v })}
        />
        <NumericInput
          label={t('common.month')}
          value={form.month}
          onChange={(v) => setForm({ ...form, month: Math.min(12, Math.max(1, v)) })}
        />
      </div>

      <Button onClick={handleRun} variant="primary" disabled={loading} className="w-full">
        {loading ? t('common.loading') : t('assets.runDepreciation')}
      </Button>

      {error && <div className="bg-red-100 text-red-700 p-3 rounded-lg">{error}</div>}

      {result && (
        <div className="bg-green-100 border border-green-300 rounded-lg p-4 space-y-2">
          <p><strong>{t('assets.processedAssets')}:</strong> {result.processed}</p>
          <p><strong>{t('assets.totalDepreciation')}:</strong> {fmt(result.total_depreciation)}</p>
        </div>
      )}
    </div>
  );
}

// ─── Tab 4: Summary ─────────────────────────────────────────────────────────

function SummaryTab() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<AssetSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const branchId = getBranchId();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setSummary(await getAssetsSummary(branchId));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [branchId]);

  if (loading) return <div className="text-center py-8">{t('common.loading')}</div>;
  if (!summary) return <div className="text-center py-8">{t('common.noData')}</div>;

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-white p-4 rounded-lg border border-ivory-border">
        <p className="text-ink-muted text-sm">{t('assets.totalAssets')}</p>
        <p className="text-3xl font-bold text-primary-600">{summary.total_assets}</p>
      </div>
      <div className="bg-white p-4 rounded-lg border border-ivory-border">
        <p className="text-ink-muted text-sm">{t('assets.activeAssets')}</p>
        <p className="text-3xl font-bold text-primary-600">{summary.active_assets}</p>
      </div>
      <div className="bg-white p-4 rounded-lg border border-ivory-border">
        <p className="text-ink-muted text-sm">{t('assets.totalPurchaseCost')}</p>
        <p className="text-2xl font-bold text-ink-main">{fmt(summary.total_purchase_cost)}</p>
      </div>
      <div className="bg-white p-4 rounded-lg border border-ivory-border">
        <p className="text-ink-muted text-sm">{t('assets.totalNbv')}</p>
        <p className="text-2xl font-bold text-ink-main">{fmt(summary.total_nbv)}</p>
      </div>
      <div className="bg-white p-4 rounded-lg border border-ivory-border">
        <p className="text-ink-muted text-sm">{t('assets.totalDepreciated')}</p>
        <p className="text-2xl font-bold text-ink-main">{fmt(summary.total_depreciated)}</p>
      </div>
      <div className="bg-white p-4 rounded-lg border border-ivory-border">
        <p className="text-ink-muted text-sm">{t('assets.disposedThisYear')}</p>
        <p className="text-3xl font-bold text-orange-600">{summary.disposed_this_year}</p>
      </div>
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function Assets() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('register');

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t('nav.assets')}</h1>

      <div className="flex gap-2 flex-wrap">
        <TabButton active={activeTab === 'register'} onClick={() => setActiveTab('register')}>
          {t('assets.register')}
        </TabButton>
        <TabButton active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')}>
          {t('assets.depreciationSchedule')}
        </TabButton>
        <TabButton active={activeTab === 'run'} onClick={() => setActiveTab('run')}>
          {t('assets.runDepreciation')}
        </TabButton>
        <TabButton active={activeTab === 'summary'} onClick={() => setActiveTab('summary')}>
          {t('assets.summary')}
        </TabButton>
      </div>

      <div className="bg-white rounded-lg p-6">
        {activeTab === 'register' && <RegisterTab />}
        {activeTab === 'schedule' && <ScheduleTab />}
        {activeTab === 'run' && <RunTab />}
        {activeTab === 'summary' && <SummaryTab />}
      </div>
    </div>
  );
}
