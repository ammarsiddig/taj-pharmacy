import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Package, ScanLine, FolderTree, Coins, AlertTriangle, StickyNote, Factory, FlaskConical, Tablets, Thermometer, ClipboardList } from 'lucide-react';
import * as api from '../../api';
import type { Product, ProductFormData, UnitMeasure } from '../../types';
import Button from '../ui/Button';
import ProductImageSection from './ProductImageSection';
import SubstitutesSection from './SubstitutesSection';

interface ProductPanelProps {
  product: Product | null;
  onSave: (data: ProductFormData) => Promise<void>;
  onClose: () => void;
}

export default function ProductPanel({ product, onSave, onClose }: ProductPanelProps) {
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
  // TASK-939: SDG-piasters per 1 USD (0 = exchange-rate pricing off). When set, we
  // show a small "≈ $X.XX" anchor hint next to the SDG price inputs. SDG stays primary.
  const [usdRatePiasters, setUsdRatePiasters] = useState(0);

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

  useEffect(() => {
    api.getTenantSettings().then((s) => setUsdRatePiasters(s.usd_rate_piasters)).catch(() => setUsdRatePiasters(0));
  }, []);

  // Form prices are in SDG; the rate is SDG-piasters per USD. usd = sdg * 100 / rate.
  const usdHint = (sdgValue: number): string | null => {
    if (usdRatePiasters <= 0) return null;
    const usd = (Number(sdgValue) * 100) / usdRatePiasters;
    if (!isFinite(usd) || usd <= 0) return null;
    return `≈ $${usd.toFixed(2)}`;
  };

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
            <h4 className={sectionTitle}>{t('products.primaryInfo')}</h4>
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
                   <input value={form.active_ingredient || ''} onChange={(e) => updateField('active_ingredient', e.target.value)} className={inp} placeholder={t('products.nameHint')} />
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
                     <input className="app-input w-full px-2 py-1.5 text-xs" placeholder={t('products.unitNameEn')} value={newUnitName} onChange={(e) => setNewUnitName(e.target.value)} />
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
                  <span className="text-sm font-medium text-ink-main">{t('products.enableSubUnits')}</span>
                </label>
                {form.enable_sub_units && (
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-ink-muted">{t('products.subUnit')}</label>
                      <select value={form.sub_unit_id || ''} onChange={(e) => updateField('sub_unit_id', e.target.value)} className={inp}>
                        <option value="">{t('common.select')}</option>
                        {unitOptions.filter((u) => u.value !== form.unit_id).map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </select>
                      {errors.sub_unit_id && <p className="mt-1 text-xs text-status-danger">{errors.sub_unit_id}</p>}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-ink-muted">{t('products.subUnitRatio')}</label>
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
            <h4 className={sectionTitle}>{t('products.financials')}</h4>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('products.salePrice')} ({t('common.currency')})*</label>
                <div className="relative">
                  <Coins size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input type="number" step="0.01" min={0} value={Number(form.sale_price) || 0} onChange={(e) => updateField('sale_price', Number(e.target.value || 0))} className={`${inp} tabular-nums`} />
                </div>
                {usdHint(form.sale_price) && <p className="mt-1 text-xs text-ink-placeholder tabular-nums" dir="ltr">{usdHint(form.sale_price)}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('products.minSalePrice')} ({t('common.currency')})</label>
                <div className="relative">
                  <Coins size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input type="number" step="0.01" min={0} value={Number(form.min_sale_price) || 0} onChange={(e) => updateField('min_sale_price', Number(e.target.value || 0))} className={`${inp} tabular-nums`} />
                </div>
                {usdHint(form.min_sale_price) && <p className="mt-1 text-xs text-ink-placeholder tabular-nums" dir="ltr">{usdHint(form.min_sale_price)}</p>}
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

        {product && (
          <section className="app-panel p-4">
            <ProductImageSection product={product} />
          </section>
        )}

        {product && (
          <section className="app-panel p-4">
            <SubstitutesSection product={product} />
          </section>
        )}

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
