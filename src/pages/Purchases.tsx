import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Eye, Check, Trash2, Truck, FileText, ChevronUp, ChevronDown, ChevronsUpDown, ChevronRight, ChevronLeft } from 'lucide-react';
import SuppliersTab from '../components/SuppliersTab';
import * as api from '../api';
import type { PurchaseInvoiceRow, Supplier, StorageLocationFull, AccountRow, ConfirmPurchasePaymentData } from '../types';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Toast from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import { useAuditLog } from '../hooks/useAuditLog';

const PAGE_SIZE = 50;

type Tab = 'invoices' | 'suppliers';

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-4 py-2.5 text-sm font-medium border transition-colors ${
        active
          ? 'border-primary-600 text-primary-600 bg-white shadow-[var(--shadow-soft)]'
          : 'border-ivory-border text-ink-muted bg-ivory-muted hover:text-ink-main hover:bg-white'
      }`}
    >
      <span className="inline-flex items-center gap-2">
        {icon}
        {children}
      </span>
    </button>
  );
}

export default function Purchases() {
  const { t } = useTranslation();
  const { log: auditLog } = useAuditLog();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('invoices');
  const [invoices, setInvoices] = useState<PurchaseInvoiceRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const [modal, setModal] = useState<{ type: 'confirm' | 'deleteDraft'; id: string } | null>(null);
  const [locations, setLocations] = useState<StorageLocationFull[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [confirmPaymentInfo, setConfirmPaymentInfo] = useState<ConfirmPurchasePaymentData>({
    payment_mode: 'unpaid',
    payment_method: 'cash',
    payment_date: new Date().toISOString().slice(0, 10),
    account_id: '',
  });

  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);

  const branchId = api.getBranchId();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, sup] = await Promise.all([
        api.getPurchaseInvoices(branchId, {
          supplierId: supplierFilter || undefined,
          status: statusFilter || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
        api.getSuppliers(),
      ]);
      // Client-side search filter
      const filtered = search
        ? inv.filter(i =>
            i.supplier_name.toLowerCase().includes(search.toLowerCase()) ||
            i.invoice_number.toLowerCase().includes(search.toLowerCase()))
        : inv;
      setInvoices(filtered);
      setSuppliers(sup);
    } catch (e: unknown) {
      setToast({ msg: api.errMsg(e, t('common.error')), type: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [branchId, supplierFilter, statusFilter, dateFrom, dateTo, search, t]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    api.getStorageLocations(branchId).then(locs => {
      const active = locs.filter(l => l.is_active);
      setLocations(active);
      if (active.length > 0) setSelectedLocationId(active[0].id);
    }).catch((e: unknown) => { console.error('[Purchases] getStorageLocations failed:', e); });
    api.getAllAccounts(branchId).then(accts => {
      const active = accts.filter(a => a.is_active);
      setAccounts(active);
      if (active.length > 0) {
        const first = active[0];
        const derived = api.paymentMethodFromAccountType(first.account_type);
        setConfirmPaymentInfo(p => ({ ...p, account_id: first.id, payment_method: derived }));
      }
    }).catch((e: unknown) => { console.error('[Purchases] getAllAccounts failed:', e); });
  }, [branchId]);

  const activeAccounts = useMemo(() => accounts.filter(a => a.is_active), [accounts]);

  const handleConfirm = async (id: string) => {
    try {
      const auth = api.getAuthState();
      await api.confirmPurchaseWithPayment(
        id,
        auth.user!.id,
        selectedLocationId || null,
        confirmPaymentInfo,
      );
      auditLog('confirm', 'purchase_invoice', id);
      setToast({ msg: t('purchases.confirmedSuccess'), type: 'success' });
      setModal(null);
      loadData();
    } catch (e: unknown) {
      setToast({ msg: api.errMsg(e, t('common.error')), type: 'danger' });
      setModal(null);
    }
  };

  const handleDeleteDraft = async (id: string) => {
    try {
      const auth = api.getAuthState();
      await api.deletePurchaseDraft(id, auth.user!.id);
      setToast({ msg: t('purchases.deleteDraftSuccess'), type: 'success' });
      setModal(null);
      loadData();
    } catch (e: unknown) {
      setToast({ msg: api.errMsg(e, t('common.error')), type: 'danger' });
      setModal(null);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'draft': return <Badge variant="neutral">{t('purchases.statusDraft')}</Badge>;
      case 'confirmed': return <Badge variant="success">{t('purchases.statusConfirmed')}</Badge>;
      case 'cancelled': return <Badge variant="danger">{t('purchases.statusCancelled')}</Badge>;
      default: return null;
    }
  };

  const payBadge = (ps: string) => {
    switch (ps) {
      case 'unpaid': return <Badge variant="warning">{t('purchases.payUnpaid')}</Badge>;
      case 'partial': return <Badge variant="neutral">{t('purchases.payPartial')}</Badge>;
      case 'paid': return <Badge variant="success">{t('purchases.payPaid')}</Badge>;
      default: return null;
    }
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

  const sortedInvoices = useMemo(() => {
    if (!sortKey) return invoices;
    return [...invoices].sort((a, b) => {
      const va = (a as unknown as Record<string, unknown>)[sortKey];
      const vb = (b as unknown as Record<string, unknown>)[sortKey];

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
  }, [invoices, sortKey, sortDir]);

  useEffect(() => {
    setCurrentPage(1);
  }, [sortedInvoices.length]);

  const totalPages = Math.max(1, Math.ceil(sortedInvoices.length / PAGE_SIZE));
  const paginatedInvoices = sortedInvoices.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const firstItem = (currentPage - 1) * PAGE_SIZE + 1;
  const lastItem = Math.min(currentPage * PAGE_SIZE, sortedInvoices.length);

  const pageButtons: number[] = [];
  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) pageButtons.push(i);
  } else {
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    for (let i = start; i <= end; i++) pageButtons.push(i);
  }

  return (
    <div className="h-full space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-ink-main">{t('purchases.title')}</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {t('purchases.searchPlaceholder')}، {t('purchases.newInvoice')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-2">
            <TabButton active={activeTab === 'invoices'} onClick={() => setActiveTab('invoices')} icon={<FileText size={15} />}>
              {t('purchases.invoicesTab')}
            </TabButton>
            <TabButton active={activeTab === 'suppliers'} onClick={() => setActiveTab('suppliers')} icon={<Truck size={15} />}>
              {t('suppliers.title')}
            </TabButton>
          </div>
          {activeTab === 'invoices' && (
            <Button onClick={() => navigate('/purchases/new')}>
              <Plus size={16} className="inline ms-1" />{t('purchases.newInvoice')}
            </Button>
          )}
        </div>
      </div>

      {activeTab === 'suppliers' ? (
        <SuppliersTab />
      ) : (
      <>
      
 
      {/* Filters */}
      <div className="sales-form-toolbar app-card flex flex-wrap gap-3 p-4">
        <input
          type="text"
          placeholder={t('purchases.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="app-input min-w-[220px] flex-1 px-3 py-2.5 text-sm text-ink-main placeholder:text-ink-placeholder focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
        <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}
          className="app-input min-w-[180px] px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100">
          <option value="">{t('purchases.allSuppliers')}</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="app-input min-w-[160px] px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100">
          <option value="">{t('purchases.allStatuses')}</option>
          <option value="draft">{t('purchases.statusDraft')}</option>
          <option value="confirmed">{t('purchases.statusConfirmed')}</option>
          <option value="cancelled">{t('purchases.statusCancelled')}</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="app-input px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="app-input px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
      </div>

      {/* Table */}
      {loading ? (
        <div className="app-card py-12 text-center text-ink-muted">{t('common.loading')}</div>
      ) : invoices.length === 0 ? (
        <div className="app-card py-20 text-center text-ink-muted">{t('purchases.empty')}</div>
      ) : (
        <div className="sales-form-table-wrap app-card overflow-hidden">
          <table className="sales-form-table w-full text-sm">
            <thead>
              <tr>
                <th
                  className="px-4 py-2.5 text-right font-medium text-ink-muted cursor-pointer hover:text-ink-main select-none"
                  onClick={() => handleSort('invoice_number')}
                >
                  {t('purchases.invoiceNumber')}
                  {sortIcon('invoice_number')}
                </th>
                <th
                  className="px-4 py-2.5 text-right font-medium text-ink-muted cursor-pointer hover:text-ink-main select-none"
                  onClick={() => handleSort('invoice_date')}
                >
                  {t('purchases.date')}
                  {sortIcon('invoice_date')}
                </th>
                <th
                  className="px-4 py-2.5 text-right font-medium text-ink-muted cursor-pointer hover:text-ink-main select-none"
                  onClick={() => handleSort('supplier_name')}
                >
                  {t('purchases.supplier')}
                  {sortIcon('supplier_name')}
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('purchases.items')}</th>
                <th
                  className="px-4 py-2.5 text-right font-medium text-ink-muted cursor-pointer hover:text-ink-main select-none"
                  onClick={() => handleSort('total_amount')}
                >
                  {t('purchases.total')}
                  {sortIcon('total_amount')}
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('purchases.paid')}</th>
                <th
                  className="px-4 py-2.5 text-right font-medium text-ink-muted cursor-pointer hover:text-ink-main select-none"
                  onClick={() => handleSort('status')}
                >
                  {t('purchases.status')}
                  {sortIcon('status')}
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('purchases.paymentStatus')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('purchases.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedInvoices.map(inv => (
                <tr key={inv.id} className="group border-b border-ivory-border bg-white transition-colors">
                  <td className="px-4 py-2.5 tabular-nums font-medium text-ink-main">
                    <span className="inline-flex items-center gap-1.5">
                      {inv.invoice_number}
                      {inv.has_overdue_schedule && (
                        <span className="inline-block h-2 w-2 rounded-full bg-status-danger" title={t('purchases.overdueScheduleIndicator')} />
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-muted">{inv.invoice_date}</td>
                  <td className="px-4 py-2.5 text-ink-main">{inv.supplier_name}</td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-muted">{inv.items_count}</td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-main">{api.formatMoney(inv.total)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-muted">{api.formatMoney(inv.amount_paid)}</td>
                  <td className="px-4 py-2.5">{statusBadge(inv.status)}</td>
                  <td className="px-4 py-2.5">{payBadge(inv.payment_status)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button onClick={() => navigate(`/purchases/${inv.id}`)}
                        className="rounded-xl border border-transparent p-2 text-ink-muted hover:border-ivory-border hover:bg-white hover:text-primary-600" title={t('common.view')}>
                        <Eye size={16} />
                      </button>
                      {inv.status === 'draft' && (
                        <>
                          <button onClick={() => setModal({ type: 'confirm', id: inv.id })}
                            className="rounded-xl border border-transparent p-2 text-ink-muted hover:border-ivory-border hover:bg-white hover:text-status-success" title={t('common.confirm')}>
                            <Check size={16} />
                          </button>
                          <button onClick={() => setModal({ type: 'deleteDraft', id: inv.id })}
                            className="rounded-xl border border-transparent p-2 text-ink-muted hover:border-ivory-border hover:bg-white hover:text-status-danger" title={t('purchases.deleteDraft')}>
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sortedInvoices.length > PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-ink-muted">
            عرض {firstItem}–{lastItem} من {sortedInvoices.length} فاتورة
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

      {modal?.type === 'confirm' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[400px] rounded-2xl bg-white p-5 shadow-[var(--shadow-float)] border border-ivory-border">
            <h3 className="mb-1 font-bold text-ink-main">{t('purchases.confirmTitle')}</h3>
            <p className="mb-4 text-sm text-ink-muted">{t('purchases.confirmMsg')}</p>

            {locations.length > 0 && (
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.storageLocation')}</label>
                <select value={selectedLocationId} onChange={e => setSelectedLocationId(e.target.value)} className="app-input w-full px-3 py-2 text-sm">
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name_ar || l.name}</option>)}
                </select>
              </div>
            )}

            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.confirmPaymentMode')}</label>
              <select
                value={confirmPaymentInfo.payment_mode}
                onChange={e => setConfirmPaymentInfo(p => ({ ...p, payment_mode: e.target.value as ConfirmPurchasePaymentData['payment_mode'] }))}
                className="app-input w-full px-3 py-2 text-sm"
              >
                <option value="unpaid">{t('purchases.payModeUnpaid')}</option>
                <option value="paid">{t('purchases.payModePaid')}</option>
                <option value="partial">{t('purchases.payModePartial')}</option>
              </select>
            </div>

            {(confirmPaymentInfo.payment_mode === 'paid' || confirmPaymentInfo.payment_mode === 'partial') && (
              <>
                {activeAccounts.length > 0 && (
                  <div className="mb-3">
                    <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.account')}</label>
                    <select
                      value={confirmPaymentInfo.account_id ?? ''}
                      onChange={e => {
                        const acct = activeAccounts.find(a => a.id === e.target.value);
                        const derived = acct ? api.paymentMethodFromAccountType(acct.account_type) : 'cash';
                        setConfirmPaymentInfo(p => ({ ...p, account_id: e.target.value, payment_method: derived }));
                      }}
                      className="app-input w-full px-3 py-2 text-sm"
                    >
                      {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.name_ar || a.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="mb-3">
                  <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.paymentDate')}</label>
                  <input
                    type="date"
                    value={confirmPaymentInfo.payment_date ?? ''}
                    onChange={e => setConfirmPaymentInfo(p => ({ ...p, payment_date: e.target.value }))}
                    className="app-input w-full px-3 py-2 text-sm"
                  />
                </div>
                {confirmPaymentInfo.payment_mode === 'partial' && (
                  <div className="mb-3">
                    <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.partialAmount')}</label>
                    <input
                      type="number"
                      min={0}
                      value={(confirmPaymentInfo.amount_paid ?? 0) / 100}
                      onChange={e => setConfirmPaymentInfo(p => ({ ...p, amount_paid: Math.round(parseFloat(e.target.value || '0') * 100) }))}
                      className="app-input w-full px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setModal(null)} className="rounded-xl border border-ivory-border px-4 py-2 text-sm text-ink-muted hover:bg-ivory-muted">{t('common.cancel')}</button>
              <Button onClick={() => handleConfirm(modal.id)}>{t('purchases.confirm')}</Button>
            </div>
          </div>
        </div>
      )}
      <Modal
        open={modal?.type === 'deleteDraft'}
        title={t('purchases.deleteDraftTitle')}
        message={t('purchases.deleteDraftMsg')}
        variant="danger"
        onConfirm={() => handleDeleteDraft(modal!.id)}
        onCancel={() => setModal(null)}
      />

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      </>
      )}
    </div>
  );
}
