import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Settings2, ShoppingCart, ChevronUp, ChevronDown, ChevronsUpDown, ChevronRight, ChevronLeft } from 'lucide-react';
import * as api from '../api';
import type { Product, ProductFormData, ProductImportResult } from '../types';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Toast from '../components/ui/Toast';
import ProductImportModal from '../components/products/ProductImportModal';
import UnitManagementModal from '../components/products/UnitManagementModal';
import ProductPanel from '../components/products/ProductPanel';
import { useAuditLog } from '../hooks/useAuditLog';
import { useLicense } from '../hooks/useLicense';

const PAGE_SIZE = 50;

export default function Products() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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

  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);

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

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === 'asc') {
        setSortDir('desc');
      } else {
        setSortKey(null);
        setSortDir('asc');
      }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortIcon = (key: string) => {
    if (sortKey === key) {
      return sortDir === 'asc'
        ? <ChevronUp size={14} className="inline ms-1" />
        : <ChevronDown size={14} className="inline ms-1" />;
    }
    return <ChevronsUpDown size={14} className="inline ms-1 text-ink-placeholder" />;
  };

  const sortedProducts = useMemo(() => {
    if (!sortKey) return products;
    return [...products].sort((a, b) => {
      const va = (a as Record<string, unknown>)[sortKey];
      const vb = (b as Record<string, unknown>)[sortKey];

      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;

      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb), 'ar', { sensitivity: 'base', numeric: true });
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [products, sortKey, sortDir]);

  useEffect(() => {
    setCurrentPage(1);
  }, [sortedProducts.length]);

  const totalPages = Math.max(1, Math.ceil(sortedProducts.length / PAGE_SIZE));
  const paginatedProducts = sortedProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const firstItem = (currentPage - 1) * PAGE_SIZE + 1;
  const lastItem = Math.min(currentPage * PAGE_SIZE, sortedProducts.length);

  const pageButtons: number[] = [];
  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) pageButtons.push(i);
  } else {
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    for (let i = start; i <= end; i++) pageButtons.push(i);
  }

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
            <Button variant="secondary" onClick={() => navigate('/purchases/new')}>
              <ShoppingCart size={16} className="me-1" />
              {t('products.purchaseInvoice')}
            </Button>
            <Button onClick={handleAdd} disabled={isBlocked} title={isBlocked ? t('license.licenseExpired') : undefined}>
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
                  <th
                    className="px-4 py-2.5 text-right font-medium text-ink-muted cursor-pointer hover:text-ink-main select-none"
                    onClick={() => handleSort('trade_name')}
                  >
                    {t('products.tradeName')}
                    {sortIcon('trade_name')}
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('products.activeIngredient')}</th>
                  <th
                    className="px-4 py-2.5 text-right font-medium text-ink-muted cursor-pointer hover:text-ink-main select-none"
                    onClick={() => handleSort('category')}
                  >
                    {t('products.category')}
                    {sortIcon('category')}
                  </th>
                  <th
                    className="px-4 py-2.5 text-right font-medium text-ink-muted cursor-pointer hover:text-ink-main select-none"
                    onClick={() => handleSort('sale_price')}
                  >
                    {t('products.salePrice')}
                    {sortIcon('sale_price')}
                  </th>
                  <th
                    className="px-4 py-2.5 text-right font-medium text-ink-muted cursor-pointer hover:text-ink-main select-none"
                    onClick={() => handleSort('total_stock')}
                  >
                    {t('products.stock')}
                    {sortIcon('total_stock')}
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('products.minStock')}</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('products.status')}</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('products.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedProducts.map((p) => (
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

        {sortedProducts.length > PAGE_SIZE && (
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-ink-muted">
              عرض {firstItem}–{lastItem} من {sortedProducts.length} منتج
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-ivory-border p-1.5 text-ink-muted hover:bg-ivory-muted disabled:opacity-50"
              >
                <ChevronRight size={14} />
              </button>
              {pageButtons.map((p) => (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                    p === currentPage
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'border-ivory-border text-ink-muted hover:bg-ivory-muted'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-ivory-border p-1.5 text-ink-muted hover:bg-ivory-muted disabled:opacity-50"
              >
                <ChevronLeft size={14} />
              </button>
            </div>
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
