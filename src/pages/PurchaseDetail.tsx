import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, Printer, Pencil, Plus, Trash2, CreditCard, RotateCcw, Undo2 } from 'lucide-react';
import * as api from '../api';
import type { PurchaseInvoiceDetail, StorageLocationFull, PaymentSchedule, PaymentScheduleData, AccountRow, SchedulePaymentData, ConfirmPurchasePaymentData, BatchRow, CreatePurchaseReturnData } from '../types';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Toast from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import PrintInvoice from '../components/ui/PrintInvoice';
import { useAuditLog } from '../hooks/useAuditLog';

export default function PurchaseDetail() {
  const { t } = useTranslation();
  const { log: auditLog } = useAuditLog();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<PurchaseInvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const [modal, setModal] = useState<'confirm' | 'cancel' | 'deleteDraft' | 'returnToDraft' | 'deleteSchedule' | 'paySchedule' | 'payInvoice' | 'purchaseReturn' | null>(null);
  const [returnBatches, setReturnBatches] = useState<BatchRow[]>([]);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [returnReason, setReturnReason] = useState('');
  const [returnAccountId, setReturnAccountId] = useState('');
  const [returningPurchase, setReturningPurchase] = useState(false);
  const [deleteScheduleId, setDeleteScheduleId] = useState<string | null>(null);
  const [payingScheduleId, setPayingScheduleId] = useState<string | null>(null);
  const [payingScheduleAmount, setPayingScheduleAmount] = useState<number>(0);
  const [payForm, setPayForm] = useState<SchedulePaymentData>({
    account_id: '',
    payment_method: 'cash',
    payment_date: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [locations, setLocations] = useState<StorageLocationFull[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [schedules, setSchedules] = useState<PaymentSchedule[]>([]);
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [newSchedule, setNewSchedule] = useState<PaymentScheduleData>({ due_date: '', amount: 0, note: '' });
  const [confirmPaymentInfo, setConfirmPaymentInfo] = useState<ConfirmPurchasePaymentData>({
    payment_mode: 'unpaid',
    payment_method: 'cash',
    payment_date: new Date().toISOString().slice(0, 10),
    account_id: '',
  });
  const [payInvoiceForm, setPayInvoiceForm] = useState<SchedulePaymentData>({
    account_id: '',
    payment_method: 'cash',
    payment_date: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [payInvoiceAmount, setPayInvoiceAmount] = useState<number>(0);

  // Derive payment method label from account type for read-only display
  const accountTypeFor = useMemo(() => (accountId: string): string => {
    return accounts.find(a => a.id === accountId)?.account_type ?? 'cash';
  }, [accounts]);

  const derivedMethodLabel = (accountId: string) => {
    const type = accountTypeFor(accountId);
    return type === 'bank' ? t('purchases.methodBank') : t('purchases.methodCash');
  };

  async function openReturnModal() {
    if (!id) return;
    try {
      const batches = await api.getInvoiceBatches(id);
      const active = batches.filter(b => b.quantity_current > 0);
      setReturnBatches(active);
      setReturnQtys(Object.fromEntries(active.map(b => [b.id, 0])));
      setReturnDate(new Date().toISOString().slice(0, 10));
      setReturnReason('');
      setReturnAccountId(accounts.length > 0 ? accounts[0].id : '');
      setModal('purchaseReturn');
    } catch (e: unknown) {
      setToast({ msg: api.errMsg(e, t('common.error')), type: 'danger' });
    }
  }

  async function handlePurchaseReturn() {
    if (!id || !invoice) return;
    const selectedItems = returnBatches
      .filter(b => (returnQtys[b.id] ?? 0) > 0)
      .map(b => ({ batch_id: b.id, quantity: returnQtys[b.id], reason: returnReason || undefined }));
    if (selectedItems.length === 0) {
      setToast({ msg: t('purchases.returnNoItems'), type: 'danger' }); return;
    }
    const data: CreatePurchaseReturnData = {
      return_date: returnDate,
      reason: returnReason || undefined,
      account_id: returnAccountId || undefined,
      items: selectedItems,
    };
    setReturningPurchase(true);
    try {
      const auth = api.getAuthState();
      await api.createPurchaseReturn(id, auth.user!.id, data);
      auditLog('return', 'purchase_invoice', id, returnReason);
      setToast({ msg: t('purchases.returnSuccess'), type: 'success' });
      setModal(null);
      await load();
    } catch (e: unknown) {
      setToast({ msg: api.errMsg(e, t('common.error')), type: 'danger' });
    } finally {
      setReturningPurchase(false);
    }
  }

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [data, sched] = await Promise.all([
        api.getPurchaseInvoice(id),
        api.getPaymentSchedules(id),
      ]);
      setInvoice(data);
      setSchedules(sched);
    } catch (e: unknown) {
      setToast({ msg: api.errMsg(e, t('common.error')), type: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.getStorageLocations(api.getBranchId()).then(locs => {
      const active = locs.filter(l => l.is_active);
      setLocations(active);
      if (active.length > 0) setSelectedLocationId(active[0].id);
    }).catch(() => {});
    api.getAllAccounts(api.getBranchId()).then(accts => {
      const active = accts.filter(a => a.is_active);
      setAccounts(active);
      if (active.length > 0) {
        const first = active[0];
        const derived = api.paymentMethodFromAccountType(first.account_type);
        setPayForm(f => ({ ...f, account_id: first.id, payment_method: derived }));
        setPayInvoiceForm(f => ({ ...f, account_id: first.id, payment_method: derived }));
        setConfirmPaymentInfo(p => ({ ...p, account_id: first.id, payment_method: derived }));
      }
    }).catch(() => {});
  }, []);

  const handleConfirm = async () => {
    if (!id) return;
    try {
      const auth = api.getAuthState();
      await api.confirmPurchaseWithPayment(
        id,
        auth.user!.id,
        selectedLocationId || null,
        confirmPaymentInfo,
      );
      auditLog('confirm', 'purchase_invoice', id!);
      setToast({ msg: t('purchases.confirmedSuccess'), type: 'success' });
      setModal(null);
      load();
    } catch (e: unknown) {
      setToast({ msg: api.errMsg(e, t('common.error')), type: 'danger' });
      setModal(null);
    }
  };

  const handlePayInvoice = async () => {
    if (!id || !invoice) return;
    try {
      const auth = api.getAuthState();
      const remaining = invoice.total - invoice.amount_paid;
      const amt = payInvoiceAmount > 0 ? payInvoiceAmount : remaining;
      await api.recordSupplierPayment(invoice.supplier_id, auth.user!.id, {
        invoice_id: id,
        amount: amt,
        payment_method: payInvoiceForm.payment_method,
        account_id: payInvoiceForm.account_id,
        payment_date: payInvoiceForm.payment_date,
        notes: payInvoiceForm.notes,
      });
      setToast({ msg: t('purchases.scheduleMarkedPaid'), type: 'success' });
      setModal(null);
      load();
    } catch (e: unknown) {
      setToast({ msg: api.errMsg(e, t('common.error')), type: 'danger' });
    }
  };

  const handleCancel = async () => {
    if (!id) return;
    try {
      const auth = api.getAuthState();
      await api.cancelPurchase(id, auth.user!.id);
      setToast({ msg: t('purchases.cancelledSuccess'), type: 'success' });
      setModal(null);
      load();
    } catch (e: unknown) {
      setToast({ msg: api.errMsg(e, t('common.error')), type: 'danger' });
      setModal(null);
    }
  };

  const handleDeleteDraft = async () => {
    if (!id) return;
    try {
      const auth = api.getAuthState();
      await api.deletePurchaseDraft(id, auth.user!.id);
      setModal(null);
      navigate('/purchases');
    } catch (e: unknown) {
      setToast({ msg: api.errMsg(e, t('common.error')), type: 'danger' });
      setModal(null);
    }
  };

  const handleReturnToDraft = async () => {
    if (!id) return;
    try {
      const auth = api.getAuthState();
      await api.returnPurchaseToDraft(id, auth.user!.id);
      setToast({ msg: t('purchases.returnToDraftSuccess'), type: 'success' });
      setModal(null);
      load();
    } catch (e: unknown) {
      setToast({ msg: api.errMsg(e, t('common.error')), type: 'danger' });
      setModal(null);
    }
  };

  const handleAddSchedule = async () => {
    if (!id || !newSchedule.due_date || newSchedule.amount <= 0) return;
    try {
      const created = await api.createPaymentSchedule(id, newSchedule);
      setSchedules(prev => [...prev, created]);
      setNewSchedule({ due_date: '', amount: 0, note: '' });
      setShowAddSchedule(false);
    } catch (e: unknown) {
      setToast({ msg: api.errMsg(e, t('common.error')), type: 'danger' });
    }
  };

  const openPayModal = (schedule: PaymentSchedule) => {
    setPayingScheduleId(schedule.id);
    setPayingScheduleAmount(schedule.amount);
    setPayForm(f => ({
      ...f,
      payment_date: new Date().toISOString().slice(0, 10),
      notes: '',
    }));
    setModal('paySchedule');
  };

  const handlePaySchedule = async () => {
    if (!payingScheduleId || !payForm.account_id) return;
    try {
      const auth = api.getAuthState();
      const updated = await api.markSchedulePaid(payingScheduleId, auth.user!.id, payForm);
      setSchedules(prev => prev.map(s => s.id === payingScheduleId ? updated : s));
      setModal(null);
      setPayingScheduleId(null);
      setToast({ msg: t('purchases.scheduleMarkedPaid'), type: 'success' });
      load();
    } catch (e: unknown) {
      setToast({ msg: api.errMsg(e, t('common.error')), type: 'danger' });
    }
  };

  const confirmDeleteSchedule = async () => {
    if (!deleteScheduleId) return;
    try {
      await api.deletePaymentSchedule(deleteScheduleId);
      setSchedules(prev => prev.filter(s => s.id !== deleteScheduleId));
      setModal(null);
      setDeleteScheduleId(null);
    } catch (e: unknown) {
      setToast({ msg: api.errMsg(e, t('common.error')), type: 'danger' });
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

  const payStatusBadge = (ps: string) => {
    switch (ps) {
      case 'unpaid': return <Badge variant="warning">{t('purchases.payStatusUnpaid')}</Badge>;
      case 'partial': return <Badge variant="neutral">{t('purchases.payStatusPartial')}</Badge>;
      case 'paid': return <Badge variant="success">{t('purchases.payStatusPaid')}</Badge>;
      default: return null;
    }
  };

  if (loading) return <div className="text-center py-20 text-ink-muted">{t('common.loading')}</div>;
  if (!invoice) return <div className="text-center py-20 text-ink-muted">{t('common.error')}</div>;

  return (
    <div className="h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/purchases')}
          className="p-1 text-ink-muted hover:text-primary-600">
          <ArrowRight size={20} />
        </button>
        <h2 className="text-xl font-bold text-ink-main">{t('purchases.invoiceDetail')}</h2>
        <span className="text-lg font-mono text-primary-600">{invoice.invoice_number}</span>
        <div className="mr-auto flex items-center gap-2">
          {statusBadge(invoice.status)}
          {invoice.status === 'confirmed' && payStatusBadge(invoice.payment_status)}
        </div>
        {/* Draft actions */}
        {invoice.status === 'draft' && (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => navigate(`/purchases/${id}/edit`)}>
              <Pencil size={16} className="inline ms-1" />{t('purchases.editInvoice')}
            </Button>
            <Button variant="primary" onClick={() => setModal('confirm')}>
              <Check size={16} className="inline ms-1" />{t('purchases.confirm')}
            </Button>
            <Button variant="danger" onClick={() => setModal('deleteDraft')}>
              <Trash2 size={16} className="inline ms-1" />{t('purchases.deleteDraft')}
            </Button>
          </div>
        )}
        {/* Confirmed actions */}
        {invoice.status === 'confirmed' && (
          <Button variant="ghost" onClick={openReturnModal}>
            <Undo2 size={16} className="inline ms-1" />{t('purchases.returnItems')}
          </Button>
        )}
        {invoice.status === 'confirmed' && invoice.payment_status !== 'paid' && (
          <Button variant="secondary" onClick={() => {
            const remaining = invoice.total - invoice.amount_paid;
            setPayInvoiceAmount(remaining);
            const firstAcct = accounts.length > 0 ? accounts[0] : null;
            setPayInvoiceForm(f => ({
              ...f,
              payment_date: new Date().toISOString().slice(0, 10),
              account_id: firstAcct?.id ?? '',
              payment_method: api.paymentMethodFromAccountType(firstAcct?.account_type ?? 'cash'),
            }));
            setModal('payInvoice');
          }}>
            <CreditCard size={16} className="inline ms-1" />{t('purchases.payInvoice')}
          </Button>
        )}
        {invoice.status === 'confirmed' && invoice.payment_status === 'unpaid' && (
          <Button variant="ghost" onClick={() => setModal('returnToDraft')}>
            <RotateCcw size={16} className="inline ms-1" />{t('purchases.returnToDraft')}
          </Button>
        )}
        <Button variant="ghost" onClick={() => window.print()}>
          <Printer size={16} />
        </Button>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6 p-4 bg-ivory-muted rounded-sm border border-ivory-border">
        <div>
          <div className="text-xs text-ink-muted mb-1">{t('purchases.supplier')}</div>
          <div className="text-ink-main font-medium">{invoice.supplier_name}</div>
        </div>
        <div>
          <div className="text-xs text-ink-muted mb-1">{t('purchases.date')}</div>
          <div className="text-ink-main">{invoice.invoice_date}</div>
        </div>
        <div>
          <div className="text-xs text-ink-muted mb-1">{t('purchases.total')}</div>
          <div className="text-ink-main font-bold tabular-nums">{api.formatMoney(invoice.total)}</div>
        </div>
        <div>
          <div className="text-xs text-ink-muted mb-1">{t('purchases.amountPaid')}</div>
          <div className="text-ink-main tabular-nums font-medium">{api.formatMoney(invoice.amount_paid)}</div>
        </div>
        {invoice.status === 'confirmed' && invoice.payment_status !== 'paid' ? (
          <div>
            <div className="text-xs text-ink-muted mb-1">{t('purchases.amountRemaining')}</div>
            <div className="text-status-danger font-bold tabular-nums">{api.formatMoney(invoice.total - invoice.amount_paid)}</div>
          </div>
        ) : (
          <div>
            <div className="text-xs text-ink-muted mb-1">{t('purchases.discount')}</div>
            <div className="text-ink-main tabular-nums">{api.formatMoney(invoice.discount)}</div>
          </div>
        )}
      </div>

      {/* Items Table */}
      <div className="overflow-x-auto border border-ivory-border rounded-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-ivory-muted border-b border-ivory-border">
              <th className="px-4 py-2.5 text-right font-medium text-ink-muted">#</th>
              <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('purchases.productName')}</th>
              <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('purchases.batchNumber')}</th>
              <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('purchases.expiryDate')}</th>
              <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('purchases.qty')}</th>
              <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('purchases.costPrice')}</th>
              <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('purchases.sellPrice')}</th>
              <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('purchases.lineTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, i) => (
              <tr key={item.id} className="border-b border-ivory-border bg-ivory-surface">
                <td className="px-4 py-2.5 tabular-nums text-ink-muted">{i + 1}</td>
                <td className="px-4 py-2.5 text-ink-main font-medium">{item.product_name}</td>
                <td className="px-4 py-2.5 tabular-nums text-ink-muted">{item.batch_number}</td>
                <td className="px-4 py-2.5 tabular-nums text-ink-muted">{item.expiry_date}</td>
                <td className="px-4 py-2.5 tabular-nums text-ink-main">{item.quantity}</td>
                <td className="px-4 py-2.5 tabular-nums text-ink-main">{api.formatMoney(item.unit_cost)}</td>
                <td className="px-4 py-2.5 tabular-nums text-ink-main">{api.formatMoney(item.sale_price)}</td>
                <td className="px-4 py-2.5 tabular-nums text-ink-main font-medium">{api.formatMoney(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-ivory-muted">
              <td colSpan={7} className="px-4 py-2.5 text-left font-bold text-ink-main">{t('purchases.grandTotal')}</td>
              <td className="px-4 py-2.5 tabular-nums font-bold text-primary-600">{api.formatMoney(invoice.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {invoice.notes && (
        <div className="mt-4 p-3 bg-ivory-muted rounded-sm border border-ivory-border">
          <div className="text-xs text-ink-muted mb-1">{t('purchases.notes')}</div>
          <div className="text-ink-main text-sm">{invoice.notes}</div>
        </div>
      )}

      {/* Payment Schedules — only for confirmed invoices with remaining balance */}
      {invoice.status === 'confirmed' && invoice.payment_status !== 'paid' && (
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-ink-main">{t('purchases.scheduleTitle')}</h3>
          <button
            onClick={() => setShowAddSchedule(s => !s)}
            className="flex items-center gap-1 rounded-xl border border-ivory-border px-3 py-1.5 text-sm text-ink-muted hover:text-primary-600 hover:bg-ivory-muted"
          >
            <Plus size={14} />{t('purchases.addSchedule')}
          </button>
        </div>

        {showAddSchedule && (
          <div className="mb-3 flex flex-wrap gap-2 p-3 bg-ivory-muted rounded-sm border border-ivory-border">
            <input
              type="date"
              value={newSchedule.due_date}
              onChange={e => setNewSchedule(s => ({ ...s, due_date: e.target.value }))}
              className="app-input px-3 py-2 text-sm"
            />
            <input
              type="number"
              placeholder={t('purchases.scheduleAmount')}
              value={newSchedule.amount > 0 ? newSchedule.amount / 100 : ''}
              onChange={e => setNewSchedule(s => ({ ...s, amount: Math.round(parseFloat(e.target.value || '0') * 100) }))}
              min={0}
              step={0.01}
              className="app-input px-3 py-2 text-sm w-32"
            />
            <input
              type="text"
              placeholder={t('purchases.scheduleNote')}
              value={newSchedule.note ?? ''}
              onChange={e => setNewSchedule(s => ({ ...s, note: e.target.value }))}
              className="app-input px-3 py-2 text-sm flex-1 min-w-[120px]"
            />
            <Button onClick={handleAddSchedule}>{t('common.save')}</Button>
          </div>
        )}

        {schedules.length === 0 ? (
          <div className="py-6 text-center text-sm text-ink-muted border border-dashed border-ivory-border rounded-sm">
            {t('purchases.scheduleEmpty')}
          </div>
        ) : (
          <div className="overflow-x-auto border border-ivory-border rounded-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ivory-muted border-b border-ivory-border">
                  <th className="px-4 py-2 text-right font-medium text-ink-muted">{t('purchases.scheduleDueDate')}</th>
                  <th className="px-4 py-2 text-right font-medium text-ink-muted">{t('purchases.scheduleAmount')}</th>
                  <th className="px-4 py-2 text-right font-medium text-ink-muted">{t('purchases.scheduleNote')}</th>
                  <th className="px-4 py-2 text-right font-medium text-ink-muted">{t('purchases.scheduleStatus')}</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {schedules.map(s => {
                  const today = new Date().toISOString().slice(0, 10);
                  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
                  const isOverdue = !s.is_paid && s.due_date < today;
                  const isDueSoon = !s.is_paid && !isOverdue && s.due_date <= tomorrow;
                  return (
                    <tr key={s.id} className="border-b border-ivory-border bg-ivory-surface last:border-0">
                      <td className={`px-4 py-2 tabular-nums ${
                        isOverdue ? 'text-status-danger font-medium'
                        : isDueSoon ? 'text-amber-600 font-medium'
                        : 'text-ink-main'
                      }`}>
                        {s.due_date}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-ink-main">{api.formatMoney(s.amount)}</td>
                      <td className="px-4 py-2 text-ink-muted">{s.note}</td>
                      <td className="px-4 py-2">
                        {s.is_paid
                          ? <span className="text-status-success text-xs font-medium">{t('purchases.schedulePaid')}</span>
                          : isOverdue
                            ? <span className="text-status-danger text-xs font-medium">{t('purchases.scheduleOverdue')}</span>
                            : isDueSoon
                              ? <span className="text-amber-600 text-xs font-medium">{t('purchases.scheduleDueSoon')}</span>
                              : <span className="text-ink-muted text-xs">{t('purchases.schedulePending')}</span>
                        }
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1 justify-end">
                          {!s.is_paid && (
                            <button
                              onClick={() => openPayModal(s)}
                              className="flex items-center gap-1 rounded-lg border border-ivory-border px-2 py-1 text-xs text-ink-muted hover:text-primary-600 hover:border-primary-600"
                              title={t('purchases.markPaid')}
                            >
                              <CreditCard size={13} />{t('purchases.payNow')}
                            </button>
                          )}
                          {!s.is_paid && (
                            <button
                              onClick={() => { setDeleteScheduleId(s.id); setModal('deleteSchedule'); }}
                              className="p-1.5 rounded-lg text-ink-muted hover:text-status-danger hover:bg-red-50"
                              title={t('common.delete')}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Confirm modal with location + payment choice */}
      {modal === 'confirm' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[420px] rounded-2xl bg-white p-5 shadow-[var(--shadow-float)] border border-ivory-border">
            <h3 className="mb-1 font-bold text-ink-main">{t('purchases.confirmTitle')}</h3>
            <p className="mb-4 text-sm text-ink-muted">{t('purchases.confirmMsg')}</p>
            {locations.length > 0 && (
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.storageLocation')}</label>
                <select
                  value={selectedLocationId}
                  onChange={e => setSelectedLocationId(e.target.value)}
                  className="app-input w-full px-3 py-2 text-sm"
                >
                  {locations.map(l => (
                    <option key={l.id} value={l.id}>{l.name_ar || l.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.confirmPaymentMode')}</label>
              <select
                value={confirmPaymentInfo.payment_mode}
                onChange={e => setConfirmPaymentInfo(p => ({ ...p, payment_mode: e.target.value as 'unpaid' | 'paid' | 'partial' }))}
                className="app-input w-full px-3 py-2 text-sm"
              >
                <option value="unpaid">{t('purchases.payModeUnpaid')}</option>
                <option value="paid">{t('purchases.payModePaid')}</option>
                <option value="partial">{t('purchases.payModePartial')}</option>
              </select>
            </div>
            {confirmPaymentInfo.payment_mode !== 'unpaid' && (
              <div className="space-y-3 mb-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.payAccount')}</label>
                  <select
                    value={confirmPaymentInfo.account_id ?? ''}
                    onChange={e => {
                      const acctId = e.target.value;
                      const derived = api.paymentMethodFromAccountType(accountTypeFor(acctId));
                      setConfirmPaymentInfo(p => ({ ...p, account_id: acctId, payment_method: derived }));
                    }}
                    className="app-input w-full px-3 py-2 text-sm"
                  >
                    <option value="">{t('purchases.payAccount')}</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name_ar || a.name} — {api.formatMoney(a.current_balance)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.payMethod')}</label>
                  <div className="px-3 py-2 text-sm rounded-lg bg-ivory-muted border border-ivory-border text-ink-muted">
                    {derivedMethodLabel(confirmPaymentInfo.account_id ?? '')}
                  </div>
                </div>
                {confirmPaymentInfo.payment_mode === 'partial' && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.partialAmount')}</label>
                    <input
                      type="number"
                      min={0.01}
                      step={0.01}
                      value={confirmPaymentInfo.amount_paid !== undefined ? confirmPaymentInfo.amount_paid / 100 : ''}
                      onChange={e => setConfirmPaymentInfo(p => ({ ...p, amount_paid: Math.round(parseFloat(e.target.value || '0') * 100) }))}
                      className="app-input w-full px-3 py-2 text-sm"
                    />
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.payDate')}</label>
                  <input
                    type="date"
                    value={confirmPaymentInfo.payment_date ?? new Date().toISOString().slice(0, 10)}
                    onChange={e => setConfirmPaymentInfo(p => ({ ...p, payment_date: e.target.value }))}
                    className="app-input w-full px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="rounded-xl border border-ivory-border px-4 py-2 text-sm text-ink-muted hover:bg-ivory-muted">{t('common.cancel')}</button>
              <Button onClick={handleConfirm}>{t('purchases.confirm')}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Pay Invoice Modal */}
      {modal === 'payInvoice' && invoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[380px] rounded-2xl bg-white p-5 shadow-[var(--shadow-float)] border border-ivory-border">
            <h3 className="mb-1 font-bold text-ink-main">{t('purchases.payInvoiceTitle')}</h3>
            <p className="mb-4 text-sm text-ink-muted">
              {t('purchases.payInvoiceMsg')} — <span className="font-semibold tabular-nums text-ink-main">{api.formatMoney(invoice.total - invoice.amount_paid)}</span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.partialAmount')}</label>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={payInvoiceAmount > 0 ? payInvoiceAmount / 100 : ''}
                  onChange={e => setPayInvoiceAmount(Math.round(parseFloat(e.target.value || '0') * 100))}
                  className="app-input w-full px-3 py-2 text-sm"
                  placeholder={api.formatMoney(invoice.total - invoice.amount_paid).replace(' SDG', '')}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.payAccount')}</label>
                <select
                  value={payInvoiceForm.account_id}
                  onChange={e => {
                    const acctId = e.target.value;
                    const derived = api.paymentMethodFromAccountType(accountTypeFor(acctId));
                    setPayInvoiceForm(f => ({ ...f, account_id: acctId, payment_method: derived }));
                  }}
                  className="app-input w-full px-3 py-2 text-sm"
                >
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name_ar || a.name} — {api.formatMoney(a.current_balance)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.payMethod')}</label>
                <div className="px-3 py-2 text-sm rounded-lg bg-ivory-muted border border-ivory-border text-ink-muted">
                  {derivedMethodLabel(payInvoiceForm.account_id)}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.payDate')}</label>
                <input
                  type="date"
                  value={payInvoiceForm.payment_date}
                  onChange={e => setPayInvoiceForm(f => ({ ...f, payment_date: e.target.value }))}
                  className="app-input w-full px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.payNotes')}</label>
                <input
                  type="text"
                  value={payInvoiceForm.notes ?? ''}
                  onChange={e => setPayInvoiceForm(f => ({ ...f, notes: e.target.value }))}
                  className="app-input w-full px-3 py-2 text-sm"
                  placeholder={t('common.optional')}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setModal(null)}
                className="rounded-xl border border-ivory-border px-4 py-2 text-sm text-ink-muted hover:bg-ivory-muted"
              >
                {t('common.cancel')}
              </button>
              <Button onClick={handlePayInvoice} disabled={!payInvoiceForm.account_id}>
                {t('purchases.confirmPay')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Pay Schedule Modal */}
      {modal === 'paySchedule' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[380px] rounded-2xl bg-white p-5 shadow-[var(--shadow-float)] border border-ivory-border">
            <h3 className="mb-1 font-bold text-ink-main">{t('purchases.payScheduleTitle')}</h3>
            <p className="mb-4 text-sm text-ink-muted">
              {t('purchases.payScheduleMsg')} — <span className="font-semibold tabular-nums text-ink-main">{api.formatMoney(payingScheduleAmount)}</span>
            </p>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.payAccount')}</label>
                <select
                  value={payForm.account_id}
                  onChange={e => {
                    const acctId = e.target.value;
                    const derived = api.paymentMethodFromAccountType(accountTypeFor(acctId));
                    setPayForm(f => ({ ...f, account_id: acctId, payment_method: derived }));
                  }}
                  className="app-input w-full px-3 py-2 text-sm"
                >
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name_ar || a.name} — {api.formatMoney(a.current_balance)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.payMethod')}</label>
                <div className="px-3 py-2 text-sm rounded-lg bg-ivory-muted border border-ivory-border text-ink-muted">
                  {derivedMethodLabel(payForm.account_id)}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.payDate')}</label>
                <input
                  type="date"
                  value={payForm.payment_date}
                  onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))}
                  className="app-input w-full px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.payNotes')}</label>
                <input
                  type="text"
                  value={payForm.notes ?? ''}
                  onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
                  className="app-input w-full px-3 py-2 text-sm"
                  placeholder={t('common.optional')}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setModal(null); setPayingScheduleId(null); }}
                className="rounded-xl border border-ivory-border px-4 py-2 text-sm text-ink-muted hover:bg-ivory-muted"
              >
                {t('common.cancel')}
              </button>
              <Button onClick={handlePaySchedule} disabled={!payForm.account_id}>
                {t('purchases.confirmPay')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Purchase Return Modal */}
      {modal === 'purchaseReturn' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-xl rounded-2xl border border-ivory-border bg-white shadow-[var(--shadow-float)] flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-ivory-border flex items-center gap-3">
              <Undo2 size={18} className="text-primary-600" />
              <div>
                <h3 className="font-semibold text-ink-main">{t('purchases.returnTitle')}</h3>
                <p className="text-xs text-ink-muted mt-0.5">{invoice?.invoice_number}</p>
              </div>
            </div>
            <div className="p-6 flex flex-col gap-4 overflow-y-auto">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.returnDate')}</label>
                  <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} className="app-input w-full px-3 py-2 text-sm" />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.returnAccount')}</label>
                  <select value={returnAccountId} onChange={e => setReturnAccountId(e.target.value)} className="app-input w-full px-3 py-2 text-sm">
                    <option value="">{t('common.none')}</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.returnReason')}</label>
                <input value={returnReason} onChange={e => setReturnReason(e.target.value)} placeholder={t('purchases.returnReasonPlaceholder')} className="app-input w-full px-3 py-2 text-sm" />
              </div>
              {returnBatches.length === 0 ? (
                <p className="text-center text-sm text-ink-muted py-4">{t('warehouse.inventory.emptyBatches')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ivory-border bg-ivory-muted">
                        <th className="px-3 py-2 text-start text-xs font-medium text-ink-muted">{t('purchases.productName')}</th>
                        <th className="px-3 py-2 text-start text-xs font-medium text-ink-muted">{t('purchases.batchNumber')}</th>
                        <th className="px-3 py-2 text-end text-xs font-medium text-ink-muted">{t('purchases.returnAvailableQty')}</th>
                        <th className="px-3 py-2 text-end text-xs font-medium text-ink-muted">{t('purchases.returnQty')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {returnBatches.map(b => (
                        <tr key={b.id} className="border-b border-ivory-border">
                          <td className="px-3 py-2 text-ink-main">{b.product_name_ar || b.product_name}</td>
                          <td className="px-3 py-2 text-ink-muted">{b.batch_number ?? '—'}</td>
                          <td className="px-3 py-2 text-end tabular-nums">{b.quantity_current}</td>
                          <td className="px-3 py-2 text-end">
                            <input
                              type="number" min={0} max={b.quantity_current}
                              value={returnQtys[b.id] ?? 0}
                              onChange={e => setReturnQtys(prev => ({ ...prev, [b.id]: Math.min(b.quantity_current, Math.max(0, parseInt(e.target.value) || 0)) }))}
                              className="app-input w-20 px-2 py-1 text-sm text-end"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(() => {
                const total = returnBatches.reduce((sum, b) => sum + (returnQtys[b.id] ?? 0) * (b.unit_cost ?? 0), 0);
                return total > 0 ? (
                  <div className="flex justify-end gap-2 text-sm font-semibold">
                    <span className="text-ink-muted">{t('purchases.returnTotal')}:</span>
                    <span className="text-status-danger">{api.formatMoney(total)}</span>
                  </div>
                ) : null;
              })()}
            </div>
            <div className="px-6 py-4 border-t border-ivory-border flex gap-3">
              <button onClick={() => setModal(null)} className="flex-1 rounded-xl border border-ivory-border py-2 text-sm text-ink-muted hover:bg-ivory-muted">{t('common.cancel')}</button>
              <Button onClick={handlePurchaseReturn} disabled={returningPurchase}>
                {returningPurchase ? t('common.loading') : t('purchases.returnConfirm')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={modal === 'cancel'}
        title={t('purchases.cancelTitle')}
        message={t('purchases.cancelMsg')}
        variant="danger"
        onConfirm={handleCancel}
        onCancel={() => setModal(null)}
      />

      <Modal
        open={modal === 'deleteDraft'}
        title={t('purchases.deleteDraftTitle')}
        message={t('purchases.deleteDraftMsg')}
        variant="danger"
        onConfirm={handleDeleteDraft}
        onCancel={() => setModal(null)}
      />

      <Modal
        open={modal === 'returnToDraft'}
        title={t('purchases.returnToDraftTitle')}
        message={t('purchases.returnToDraftMsg')}
        variant="warning"
        onConfirm={handleReturnToDraft}
        onCancel={() => setModal(null)}
      />

      <Modal
        open={modal === 'deleteSchedule'}
        title={t('purchases.deleteScheduleTitle')}
        message={t('purchases.deleteScheduleMsg')}
        variant="danger"
        onConfirm={confirmDeleteSchedule}
        onCancel={() => { setModal(null); setDeleteScheduleId(null); }}
      />

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Printable invoice (hidden, shown on print) */}
      <PrintInvoice
        type="purchase"
        invoiceNumber={invoice.invoice_number}
        date={invoice.invoice_date}
        partyName={invoice.supplier_name}
        partyLabel={t('purchases.supplier')}
        items={invoice.items}
        subtotal={invoice.subtotal}
        discount={invoice.discount}
        taxAmount={invoice.tax_amount}
        total={invoice.total}
        notes={invoice.notes}
        status={invoice.status}
      />
    </div>
  );
}
