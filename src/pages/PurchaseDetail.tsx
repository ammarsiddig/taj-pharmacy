import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, Printer, Pencil, Trash2, CreditCard, RotateCcw, Undo2 } from 'lucide-react';
import * as api from '../api';
import type { PurchaseInvoiceDetail, StorageLocationFull, PaymentSchedule, PaymentScheduleData, AccountRow, SchedulePaymentData, ConfirmPurchasePaymentData, BatchRow, CreatePurchaseReturnData } from '../types';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Toast from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import PrintInvoice from '../components/ui/PrintInvoice';
import PaymentSchedulesPanel from '../components/purchases/PaymentSchedulesPanel';
import PurchaseReturnModal from '../components/purchases/PurchaseReturnModal';
import ConfirmPurchaseModal from '../components/purchases/ConfirmPurchaseModal';
import PayInvoiceModal from '../components/purchases/PayInvoiceModal';
import PayScheduleModal from '../components/purchases/PayScheduleModal';
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
    }).catch((e: unknown) => { console.error('[PurchaseDetail] getStorageLocations failed:', e); });
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
    }).catch((e: unknown) => { console.error('[PurchaseDetail] getAllAccounts failed:', e); });
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

  const handleAddSchedule = async (data: PaymentScheduleData) => {
    if (!id) return;
    try {
      const created = await api.createPaymentSchedule(id, data);
      setSchedules(prev => [...prev, created]);
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6 p-4 bg-ivory-muted rounded-xl border border-ivory-border shadow-[var(--shadow-soft)]">
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
      <div className="overflow-x-auto border border-ivory-border rounded-xl shadow-[var(--shadow-soft)]">
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
        <div className="mt-4 p-3 bg-ivory-muted rounded-xl border border-ivory-border shadow-[var(--shadow-soft)]">
          <div className="text-xs text-ink-muted mb-1">{t('purchases.notes')}</div>
          <div className="text-ink-main text-sm">{invoice.notes}</div>
        </div>
      )}

      {invoice.status === 'confirmed' && invoice.payment_status !== 'paid' && (
        <PaymentSchedulesPanel
          schedules={schedules}
          onAddSchedule={handleAddSchedule}
          onPaySchedule={openPayModal}
          onDeleteSchedule={(scheduleId) => { setDeleteScheduleId(scheduleId); setModal('deleteSchedule'); }}
        />
      )}

      <ConfirmPurchaseModal
        open={modal === 'confirm'}
        locations={locations}
        selectedLocationId={selectedLocationId}
        confirmPaymentInfo={confirmPaymentInfo}
        accounts={accounts}
        accountTypeFor={accountTypeFor}
        derivedMethodLabel={derivedMethodLabel}
        onClose={() => setModal(null)}
        onLocationChange={setSelectedLocationId}
        onPaymentInfoChange={setConfirmPaymentInfo}
        onConfirm={handleConfirm}
      />

      <PayInvoiceModal
        open={modal === 'payInvoice' && !!invoice}
        remaining={invoice ? invoice.total - invoice.amount_paid : 0}
        payInvoiceAmount={payInvoiceAmount}
        payInvoiceForm={payInvoiceForm}
        accounts={accounts}
        accountTypeFor={accountTypeFor}
        derivedMethodLabel={derivedMethodLabel}
        onClose={() => setModal(null)}
        onAmountChange={setPayInvoiceAmount}
        onFormChange={setPayInvoiceForm}
        onPay={handlePayInvoice}
      />

      <PayScheduleModal
        open={modal === 'paySchedule'}
        scheduleAmount={payingScheduleAmount}
        payForm={payForm}
        accounts={accounts}
        accountTypeFor={accountTypeFor}
        derivedMethodLabel={derivedMethodLabel}
        onClose={() => { setModal(null); setPayingScheduleId(null); }}
        onFormChange={setPayForm}
        onPay={handlePaySchedule}
      />

      <PurchaseReturnModal
        open={modal === 'purchaseReturn'}
        invoiceNumber={invoice?.invoice_number ?? ''}
        returnBatches={returnBatches}
        returnQtys={returnQtys}
        returnDate={returnDate}
        returnReason={returnReason}
        returnAccountId={returnAccountId}
        accounts={accounts}
        returningPurchase={returningPurchase}
        onClose={() => setModal(null)}
        onDateChange={setReturnDate}
        onReasonChange={setReturnReason}
        onAccountChange={setReturnAccountId}
        onQtyChange={(batchId, qty) => setReturnQtys(prev => ({ ...prev, [batchId]: qty }))}
        onReturn={handlePurchaseReturn}
      />

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
        amountPaid={invoice.amount_paid}
        notes={invoice.notes}
        status={invoice.status}
      />
    </div>
  );
}
