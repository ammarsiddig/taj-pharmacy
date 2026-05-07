import { useState, useEffect, useCallback, useRef, useMemo, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Package, ScanLine, FolderTree, Coins, AlertTriangle, StickyNote, Factory, FlaskConical, Tablets, Thermometer, ClipboardList, Settings2, RefreshCw, ImagePlus, Trash2 } from 'lucide-react';
import * as api from '../api';
import type { Product, ProductFormData, ProductImportResult, ProductSubstitute, UnitMeasure } from '../types';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Toast from '../components/ui/Toast';
import ProductImportModal from '../components/products/ProductImportModal';
import UnitManagementModal from '../components/products/UnitManagementModal';
import { useAuditLog } from '../hooks/useAuditLog';
import { useLicense } from '../hooks/useLicense';

export default function Products() {
  const { t } = useTranslation();
  const { log: auditLog } = useAuditLog();
  const { isBlocked } = useLicense();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const showToast = (type: 'success' | 'danger', msg: string) => setToast({ msg, type });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const isActive = statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : null;
      const [prods, cats] = await Promise.all([
        api.getProducts(search || undefined, categoryFilter || undefined, isActive),
        api.getProductCategories(),
      ]);
      setProducts(prods);
      setCategories(cats);
    } catch (err) {
      console.error('loadData failed:', err);
      showToast('danger', String(err));
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setPanelOpen(true);
  };

  const handleAdd = () => {
    setEditingProduct(null);
    setPanelOpen(true);
  };

  const handleToggleActive = async (product: Product) => {
    try {
      await api.toggleProductActive(product.id);
      loadData();
    } catch (err) {
      console.error('toggleProductActive failed:', err);
      showToast('danger', String(err));
    }
  };

  const handleSave = async (data: ProductFormData) => {
    try {
      if (editingProduct) {
        await api.updateProduct(editingProduct.id, data);
        auditLog('update', 'product', editingProduct.id, JSON.stringify({ name: data.trade_name }));
      } else {
        const created = await api.createProduct(data);
        auditLog('create', 'product', (created as unknown as { id?: string })?.id || 'new', JSON.stringify({ name: data.trade_name }));
      }
      setPanelOpen(false);
      setEditingProduct(null);
      showToast('success', t('products.savedSuccess'));
      loadData();
    } catch (err) {
      console.error('handleSave failed:', err);
      showToast('danger', String(err));
    }
  };

  const handleClosePanel = () => {
    setPanelOpen(false);
    setEditingProduct(null);
  };

  const handleImportComplete = async (result: ProductImportResult) => {
    showToast(
      'success',
      t('products.import.importSuccess', {
        imported: result.imported,
        updated: result.updated,
        skipped: result.skipped,
      }),
    );
    setImportOpen(false);
    loadData();
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && panelOpen) {
        handleClosePanel();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [panelOpen]);

  const getStockBadge = (product: Product) => {
    const stock = product.total_stock ?? 0;
    if (stock <= 0) return <Badge variant="danger">0</Badge>;
    if (stock <= product.min_stock_level) return <Badge variant="warning">{stock}</Badge>;
    return <Badge variant="success">{stock}</Badge>;
  };

  return (
    <div className="flex h-full gap-6">
      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-ink-main">{t('products.title')}</h2>
            <p className="mt-1 text-sm text-ink-muted">
              {t('products.search')}، {t('products.import.openButton')}، {t('products.addNew')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setUnitsOpen(true)}
              className="rounded-xl border border-ivory-border bg-white p-2.5 text-ink-muted hover:text-primary-600 hover:border-primary-300 transition-colors"
              title={t('settings.units')}
            >
              <Settings2 size={18} />
            </button>
            <Button variant="secondary" onClick={() => setImportOpen(true)} disabled={isBlocked}>
              {t('products.import.openButton')}
            </Button>
            <Button onClick={handleAdd} disabled={isBlocked} title={isBlocked ? 'License expired' : undefined}>
              {t('products.addNew')}
            </Button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="sales-form-toolbar app-card mb-5 flex flex-wrap gap-3 p-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder={t('products.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="app-input w-full px-3 py-2.5 text-sm text-ink-main placeholder:text-ink-placeholder focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="app-input min-w-[180px] px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          >
            <option value="">{t('products.allCategories')}</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="app-input min-w-[180px] px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          >
            <option value="">{t('products.allStatuses')}</option>
            <option value="active">{t('products.activeOnly')}</option>
            <option value="inactive">{t('products.inactiveOnly')}</option>
          </select>
        </div>

        {/* Table or Empty state */}
        {loading ? (
          <div className="text-center py-12 text-ink-muted">{t('common.loading')}</div>
        ) : products.length === 0 && !search && !categoryFilter && !statusFilter ? (
          <EmptyState onAdd={handleAdd} />
        ) : (
          <div className="sales-form-table-wrap app-card overflow-hidden">
            <table className="sales-form-table w-full text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('products.barcode')}</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('products.tradeName')}</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('products.activeIngredient')}</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('products.category')}</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('products.salePrice')}</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('products.stock')}</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('products.minStock')}</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('products.status')}</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('products.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr
                    key={p.id}
                    className="group border-b border-ivory-border bg-white transition-colors"
                  >
                    <td className="px-4 py-2.5 tabular-nums text-ink-muted">{p.barcode || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-ink-main">{p.trade_name}</span>
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted text-xs">{p.active_ingredient || '—'}</td>
                    <td className="px-4 py-2.5 text-ink-muted">{p.category || '—'}</td>
                    <td className="px-4 py-2.5 tabular-nums text-ink-main">{api.formatMoney(p.sale_price)}</td>
                    <td className="px-4 py-2.5">{getStockBadge(p)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-ink-muted">{p.min_stock_level}</td>
                    <td className="px-4 py-2.5">
                      {p.is_active ? (
                        <Badge variant="success">{t('products.active')}</Badge>
                      ) : (
                        <Badge variant="neutral">{t('products.inactive')}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEdit(p); }}
                          className="rounded-xl border border-transparent p-2 text-ink-muted hover:border-ivory-border hover:bg-white hover:text-primary-600"
                          title={t('common.edit')}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleActive(p); }}
                          className="rounded-xl border border-transparent p-2 text-ink-muted hover:border-ivory-border hover:bg-white hover:text-status-warning"
                          title={p.is_active ? t('products.inactive') : t('products.active')}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            {p.is_active ? (
                              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                            ) : (
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
                            )}
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {products.length > 0 && (
          <div className="mt-3 text-xs text-ink-muted">
            {products.length} {t('products.title')}
          </div>
        )}
      </div>

      {/* Side Panel */}
      {panelOpen && (
        <ProductPanel
          product={editingProduct}
          onSave={handleSave}
          onClose={handleClosePanel}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <ProductImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={handleImportComplete}
      />
      <UnitManagementModal
        open={unitsOpen}
        onClose={() => setUnitsOpen(false)}
      />
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="app-card py-20 text-center">
      <svg
        className="mx-auto mb-4"
        width="80"
        height="80"
        viewBox="0 0 80 80"
        fill="none"
      >
        <rect width="80" height="80" rx="4" fill="#F1F3F0" />
        <path
          d="M28 35h24M40 23v24"
          stroke="#E2E8E4"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <h3 className="text-lg font-bold text-ink-main mb-2">{t('products.emptyTitle')}</h3>
      <p className="text-sm text-ink-muted mb-6">{t('products.emptyDesc')}</p>
      <Button onClick={onAdd}>{t('products.addFirst')}</Button>
    </div>
  );
}

interface ProductPanelProps {
  product: Product | null;
  onSave: (data: ProductFormData) => Promise<void>;
  onClose: () => void;
}

function ProductPanel({ product, onSave, onClose }: ProductPanelProps) {
  const { t } = useTranslation();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [units, setUnits] = useState<UnitMeasure[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [showNewUnit, setShowNewUnit] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitNameAr, setNewUnitNameAr] = useState('');
  const [savingUnit, setSavingUnit] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [form, setForm] = useState<ProductFormData>({
    trade_name: product?.trade_name ?? '',
    trade_name_ar: product?.trade_name_ar ?? '',
    generic_name: product?.generic_name ?? '',
    generic_name_ar: product?.generic_name_ar ?? '',
    barcode: product?.barcode ?? '',
    category: product?.category ?? '',
    unit_id: product?.unit_id ?? '',
    enable_sub_units: product?.enable_sub_units ?? false,
    sub_unit_id: product?.sub_unit_id ?? '',
    sub_unit_ratio: product?.sub_unit_ratio ?? 1,
    sale_price: product ? product.sale_price / 100 : 0,
    min_sale_price: product ? product.min_sale_price / 100 : 0,
    min_stock_level: product?.min_stock_level ?? 0,
    notes: product?.notes ?? '',
    manufacturer: product?.manufacturer ?? '',
    active_ingredient: product?.active_ingredient ?? '',
    dosage_form: product?.dosage_form ?? '',
    storage_conditions: product?.storage_conditions ?? '',
    is_prescription: product?.is_prescription ?? false,
  });

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  const loadUnits = async (selectId?: string) => {
    try {
      const rows = await api.getUnitMeasures(true);
      setUnits(rows);
      if (selectId) {
        setForm((prev) => ({ ...prev, unit_id: selectId }));
      } else if (!product?.unit_id && rows.length > 0) {
        setForm((prev) => ({ ...prev, unit_id: prev.unit_id || rows[0].id }));
      }
    } catch {
      setUnits([]);
    }
  };

  useEffect(() => { loadUnits(); }, [product?.unit_id]);

  useEffect(() => {
    api.getProductCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const handleCreateCategory = () => {
    if (!newCategoryName.trim()) return;
    const trimmed = newCategoryName.trim();
    if (!categories.includes(trimmed)) {
      setCategories((prev) => [...prev, trimmed]);
    }
    setForm((prev) => ({ ...prev, category: trimmed }));
    setShowNewCategory(false);
    setNewCategoryName('');
  };

  const handleCreateUnit = async () => {
    if (!newUnitName.trim()) return;
    setSavingUnit(true);
    try {
      const created = await api.createUnitMeasure({ name: newUnitName, name_ar: newUnitNameAr || newUnitName, is_active: true });
      setShowNewUnit(false);
      setNewUnitName('');
      setNewUnitNameAr('');
      await loadUnits(created.id);
    } catch {
      // ignore
    } finally {
      setSavingUnit(false);
    }
  };

  const updateField = (key: keyof ProductFormData, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.trade_name.trim()) errs.trade_name = t('common.required');
    if (!form.unit_id) errs.unit_id = t('common.required');
    if (form.enable_sub_units) {
      if (!form.sub_unit_id) errs.sub_unit_id = t('common.required');
      if (!form.sub_unit_ratio || Number(form.sub_unit_ratio) <= 0) errs.sub_unit_ratio = t('common.required');
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave({
        ...form,
        sale_price: Math.round(Number(form.sale_price) * 100),
        min_sale_price: Math.round(Number(form.min_sale_price) * 100),
        min_stock_level: Number(form.min_stock_level),
      });
    } finally {
      setSaving(false);
    }
  };

  const unitOptions = units.map((u) => ({ value: u.id, label: u.name_ar || u.name }));
  const inp = 'app-input w-full ps-10 pe-3 py-3 text-sm text-ink-main placeholder:text-ink-placeholder focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100';
  const sectionTitle = 'mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted';

  return (
    <div className="sales-form-modal-overlay" onClick={onClose}>
      <div className="sales-form-modal max-w-5xl" onClick={(event) => event.stopPropagation()}>
      {/* Header */}
      <div className="sales-form-panel-header">
        <h3 className="text-base font-bold text-ink-main">
          {product ? t('products.editProduct') : t('products.addProduct')}
        </h3>
        <button onClick={onClose} className="text-ink-muted hover:text-ink-main p-1">
          ✕
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="sales-form-panel-body space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="app-panel p-4">
            <h4 className={sectionTitle}>Primary Info</h4>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('products.tradeName')}*</label>
                <div className="relative">
                  <Package size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input ref={firstFieldRef} value={form.trade_name} onChange={(e) => updateField('trade_name', e.target.value)} className={inp} />
                </div>
                {errors.trade_name && <p className="mt-1 text-xs text-status-danger">{errors.trade_name}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('products.activeIngredient')}</label>
                <div className="relative">
                  <FlaskConical size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input value={form.active_ingredient || ''} onChange={(e) => updateField('active_ingredient', e.target.value)} className={inp} placeholder="e.g. Amoxicillin" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('products.barcode')}</label>
                <div className="relative">
                  <ScanLine size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input value={form.barcode || ''} onChange={(e) => updateField('barcode', e.target.value)} className={inp} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('products.category')}</label>
                <div className="relative">
                  <FolderTree size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <select
                    value={form.category || ''}
                    onChange={(e) => updateField('category', e.target.value)}
                    className={inp}
                  >
                    <option value="">{t('products.selectCategory')}</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                {!showNewCategory ? (
                  <button type="button" onClick={() => setShowNewCategory(true)} className="mt-1.5 text-xs text-primary-600 hover:underline">+ {t('products.newCategory')}</button>
                ) : (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      autoFocus
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCategory(); } }}
                      placeholder={t('products.categoryName')}
                      className="app-input flex-1 px-3 py-2 text-sm"
                    />
                    <button type="button" onClick={handleCreateCategory} className="rounded-lg bg-primary-600 px-3 py-2 text-xs font-medium text-white hover:bg-primary-700">{t('common.save')}</button>
                    <button type="button" onClick={() => { setShowNewCategory(false); setNewCategoryName(''); }} className="rounded-lg border border-ivory-border px-3 py-2 text-xs text-ink-muted hover:bg-ivory-muted">{t('common.cancel')}</button>
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('products.unit')}</label>
                <select value={form.unit_id} onChange={(e) => updateField('unit_id', e.target.value)} className={inp}>
                  {unitOptions.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
                {errors.unit_id && <p className="mt-1 text-xs text-status-danger">{errors.unit_id}</p>}
                {!showNewUnit ? (
                  <button type="button" onClick={() => setShowNewUnit(true)} className="mt-1.5 text-xs text-primary-600 hover:underline">+ {t('products.newUnit')}</button>
                ) : (
                  <div className="mt-2 flex flex-col gap-1.5 rounded-xl border border-ivory-border bg-ivory-muted p-2">
                    <input className="app-input w-full px-2 py-1.5 text-xs" placeholder="Unit name (EN)" value={newUnitName} onChange={(e) => setNewUnitName(e.target.value)} />
                    <input className="app-input w-full px-2 py-1.5 text-xs" placeholder="وحدة القياس (AR)" value={newUnitNameAr} onChange={(e) => setNewUnitNameAr(e.target.value)} dir="rtl" />
                    <div className="flex gap-1.5">
                      <button type="button" onClick={handleCreateUnit} disabled={savingUnit || !newUnitName.trim()} className="rounded-lg bg-primary-600 px-3 py-1 text-xs text-white disabled:opacity-50">{savingUnit ? t('common.loading') : t('common.save')}</button>
                      <button type="button" onClick={() => { setShowNewUnit(false); setNewUnitName(''); setNewUnitNameAr(''); }} className="rounded-lg border border-ivory-border px-3 py-1 text-xs text-ink-muted">{t('common.cancel')}</button>
                    </div>
                  </div>
                )}
              </div>
              <div className="md:col-span-2 rounded-xl border border-ivory-border bg-white p-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form.enable_sub_units} onChange={(e) => updateField('enable_sub_units', e.target.checked)} className="h-4 w-4 accent-primary-600" />
                  <span className="text-sm font-medium text-ink-main">Enable Sub-Units</span>
                </label>
                {form.enable_sub_units && (
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-ink-muted">Sub-Unit</label>
                      <select value={form.sub_unit_id || ''} onChange={(e) => updateField('sub_unit_id', e.target.value)} className={inp}>
                        <option value="">Select</option>
                        {unitOptions.filter((u) => u.value !== form.unit_id).map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </select>
                      {errors.sub_unit_id && <p className="mt-1 text-xs text-status-danger">{errors.sub_unit_id}</p>}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-ink-muted">Ratio (1 Main = X Sub)</label>
                      <input type="number" min={1} value={Number(form.sub_unit_ratio) || 1} onChange={(e) => updateField('sub_unit_ratio', Math.max(1, Number(e.target.value || 1)))} className={inp} />
                      {errors.sub_unit_ratio && <p className="mt-1 text-xs text-status-danger">{errors.sub_unit_ratio}</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="app-panel p-4">
            <h4 className={sectionTitle}>{t('products.pharmacyInfo')}</h4>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('products.manufacturer')}</label>
                <div className="relative">
                  <Factory size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input value={form.manufacturer || ''} onChange={(e) => updateField('manufacturer', e.target.value)} className={inp} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('products.dosageForm')}</label>
                <div className="relative">
                  <Tablets size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input value={form.dosage_form || ''} onChange={(e) => updateField('dosage_form', e.target.value)} className={inp} placeholder={t('products.dosageFormHint')} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('products.storageConditions')}</label>
                <div className="relative">
                  <Thermometer size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input value={form.storage_conditions || ''} onChange={(e) => updateField('storage_conditions', e.target.value)} className={inp} placeholder={t('products.storageConditionsHint')} />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form.is_prescription} onChange={(e) => updateField('is_prescription', e.target.checked)} className="h-4 w-4 accent-primary-600" />
                  <ClipboardList size={16} className="text-ink-muted" />
                  <span className="text-sm font-medium text-ink-main">{t('products.isPrescription')}</span>
                </label>
              </div>
            </div>
          </section>

          <section className="app-panel p-4">
            <h4 className={sectionTitle}>Financials</h4>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('products.salePrice')} ({t('common.currency')})*</label>
                <div className="relative">
                  <Coins size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input type="number" step="0.01" min={0} value={Number(form.sale_price) || 0} onChange={(e) => updateField('sale_price', Number(e.target.value || 0))} className={`${inp} tabular-nums`} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('products.minSalePrice')} ({t('common.currency')})</label>
                <div className="relative">
                  <Coins size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input type="number" step="0.01" min={0} value={Number(form.min_sale_price) || 0} onChange={(e) => updateField('min_sale_price', Number(e.target.value || 0))} className={`${inp} tabular-nums`} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('products.minStockLevel')}</label>
                <div className="relative">
                  <AlertTriangle size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input type="number" step="1" min={0} value={Number(form.min_stock_level) || 0} onChange={(e) => updateField('min_stock_level', Math.max(0, Number(e.target.value || 0)))} className={inp} />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('products.notes')}</label>
                <div className="relative">
                  <StickyNote size={16} className="pointer-events-none absolute right-3 top-3 text-ink-muted" />
                  <textarea value={form.notes || ''} onChange={(e) => updateField('notes', e.target.value)} rows={5} className={`${inp} min-h-[120px] resize-none`} />
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Product Image — only when editing an existing product */}
        {product && (
          <section className="app-panel p-4">
            <ProductImageSection product={product} />
          </section>
        )}

        {/* Substitutes — only when editing an existing product */}
        {product && (
          <section className="app-panel p-4">
            <SubstitutesSection product={product} />
          </section>
        )}

        {/* Buttons */}
        <div className="mt-auto flex gap-3 border-t border-ivory-border pt-4">
          <Button type="submit" disabled={saving} className="flex-1 rounded-2xl shadow-[var(--shadow-soft)]">
            {saving ? t('common.loading') : t('products.save')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} className="rounded-2xl">
            {t('products.cancel')}
          </Button>
        </div>
      </form>
      </div>
    </div>
  );
}

// ─── Product Image Section ────────────────────────────────────────────────

function ProductImageSection({ product }: { product: Product }) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getProductImage(product.id).then(img => {
      if (!cancelled) { setImageData(img); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [product.id]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) {
      setToast({ msg: t('products.imageTooLarge'), type: 'danger' });
      return;
    }
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        // Strip the data:image/...;base64, prefix
        const base64 = dataUrl.split(',')[1];
        await api.saveProductImage(product.id, base64);
        setImageData(dataUrl);
        setToast({ msg: t('products.imageSaved'), type: 'success' });
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setToast({ msg: t('common.error'), type: 'danger' });
      setUploading(false);
    }
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async () => {
    try {
      await api.deleteProductImage(product.id);
      setImageData(null);
      setToast({ msg: t('products.imageRemoved'), type: 'success' });
    } catch {
      setToast({ msg: t('common.error'), type: 'danger' });
    }
  };

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-ink-main">{t('products.productImage')}</h3>
      {loading ? (
        <div className="h-24 rounded-xl bg-ivory-muted animate-pulse" />
      ) : imageData ? (
        <div className="relative inline-block">
          <img
            src={imageData}
            alt={product.trade_name}
            className="h-32 w-32 rounded-xl object-cover border border-ivory-border shadow-sm"
          />
          <button
            type="button"
            onClick={handleDelete}
            className="absolute -top-2 -start-2 flex h-6 w-6 items-center justify-center rounded-full bg-status-danger text-white shadow"
            title={t('products.removeImage')}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex h-24 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ivory-border bg-ivory-muted text-ink-muted hover:border-primary-400 hover:text-primary-700 transition-colors disabled:opacity-50"
        >
          <ImagePlus size={20} />
          <span className="text-sm">{uploading ? t('common.loading') : t('products.addImage')}</span>
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─── Substitutes Section ──────────────────────────────────────────────────

function SubstitutesSection({ product }: { product: Product }) {
  const { t } = useTranslation();
  const [substitutes, setSubstitutes] = useState<ProductSubstitute[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);

  const existingIds = useMemo(() => new Set(substitutes.map(s => s.substitute_id)), [substitutes]);

  const loadSubstitutes = useCallback(async () => {
    setLoading(true);
    try {
      setSubstitutes(await api.getProductSubstitutes(product.id));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [product.id]);

  useEffect(() => { loadSubstitutes(); }, [loadSubstitutes]);

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const results = await api.getProducts(q, undefined, true);
      setSearchResults(results.filter(p => p.id !== product.id && !existingIds.has(p.id)));
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  }, [product.id, existingIds]);

  const handleAdd = async (substituteId: string) => {
    try {
      await api.addProductSubstitute(product.id, substituteId);
      setSearchQuery('');
      setSearchResults([]);
      setToast({ msg: t('products.substituteAdded'), type: 'success' });
      loadSubstitutes();
    } catch (e: unknown) {
      setToast({ msg: e instanceof Error ? e.message : t('common.error'), type: 'danger' });
    }
  };

  const handleRemove = async (substituteId: string) => {
    try {
      await api.removeProductSubstitute(product.id, substituteId);
      setToast({ msg: t('products.substituteRemoved'), type: 'success' });
      loadSubstitutes();
    } catch (e: unknown) {
      setToast({ msg: e instanceof Error ? e.message : t('common.error'), type: 'danger' });
    }
  };

  const inp = 'app-input w-full ps-10 pe-3 py-2 text-sm text-ink-main placeholder:text-ink-placeholder focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100';

  return (
    <div>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('products.substitutes')}</h4>
        <button type="button" onClick={loadSubstitutes} className="p-1 text-ink-muted hover:text-ink-main" title={t('common.loading')}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Current substitutes list */}
      {loading ? (
        <p className="mb-3 text-xs text-ink-muted">{t('common.loading')}</p>
      ) : substitutes.length === 0 ? (
        <p className="mb-3 text-xs text-ink-muted">{t('products.noSubstitutes')}</p>
      ) : (
        <ul className="mb-3 space-y-1.5">
          {substitutes.map(s => (
            <li key={s.id} className="flex items-center justify-between rounded-xl border border-ivory-border bg-white px-3 py-2">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-ink-main">{s.trade_name}</span>
                {s.trade_name_ar && (
                  <span className="me-1.5 text-sm text-ink-muted"> — {s.trade_name_ar}</span>
                )}
                {s.generic_name && (
                  <span className="text-xs text-ink-muted">({s.generic_name})</span>
                )}
                <span className={`ms-2 text-xs font-medium ${s.total_stock > 0 ? 'text-status-success' : 'text-status-danger'}`}>
                  · {s.total_stock} {s.total_stock > 0 ? '✓' : '✗'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(s.substitute_id)}
                className="ms-3 shrink-0 rounded-lg border border-ivory-border px-2 py-1 text-xs text-status-danger hover:bg-status-danger-bg"
              >
                {t('common.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Search input to add a substitute */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={e => handleSearch(e.target.value)}
          placeholder={t('products.searchToAddSubstitute')}
          className={inp}
        />
        {searching && (
          <RefreshCw size={13} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 animate-spin text-ink-muted" />
        )}
        {searchResults.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border border-ivory-border bg-white shadow-[var(--shadow-float)]">
            {searchResults.slice(0, 8).map(p => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => handleAdd(p.id)}
                  className="flex w-full items-center justify-between border-b border-ivory-border px-3 py-2 text-sm last:border-0 hover:bg-ivory-muted"
                >
                  <span className="font-medium text-ink-main">{p.trade_name}</span>
                  <span className="text-xs text-ink-muted">{p.trade_name_ar}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
