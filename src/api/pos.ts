import { invoke } from '../lib/tauri';
import type {
  PosSession, PosProduct, SaleCreateData, Sale,
  SessionRow, Account, SessionSaleRow, ProductSummaryRow,
  ReturnOut, ReturnCreateData, SessionReturnRow,
  PurchaseInvoiceRow, PurchaseInvoiceDetail, PurchaseInvoiceCreateData,
  PaymentSchedule, PaymentScheduleData, SchedulePaymentData, ConfirmPurchasePaymentData,
  CreatePurchaseReturnData,
} from '../types';
import { getTenantId, getBranchId } from './core';

// ====== Purchases ======

export async function getPurchaseInvoices(
  branchId: string,
  filters?: { supplierId?: string; status?: string; dateFrom?: string; dateTo?: string },
): Promise<PurchaseInvoiceRow[]> {
  return invoke('get_purchase_invoices', {
    tenantId: getTenantId(),
    branchId,
    supplierId: filters?.supplierId || null,
    status: filters?.status || null,
    dateFrom: filters?.dateFrom || null,
    dateTo: filters?.dateTo || null,
  });
}

export async function getPurchaseInvoice(id: string): Promise<PurchaseInvoiceDetail> {
  return invoke('get_purchase_invoice', { tenantId: getTenantId(), id });
}

export async function createPurchaseDraft(
  branchId: string,
  data: PurchaseInvoiceCreateData,
  userId: string,
): Promise<PurchaseInvoiceDetail> {
  return invoke('create_purchase_draft', { tenantId: getTenantId(), branchId, data, userId });
}

export async function confirmPurchase(invoiceId: string, userId: string, locationId?: string): Promise<PurchaseInvoiceDetail> {
  return invoke('confirm_purchase', { tenantId: getTenantId(), invoiceId, userId, locationId: locationId ?? null });
}

export async function confirmPurchaseWithPayment(
  invoiceId: string,
  userId: string,
  locationId: string | null,
  paymentInfo: ConfirmPurchasePaymentData,
): Promise<PurchaseInvoiceDetail> {
  return invoke('confirm_purchase_with_payment', {
    tenantId: getTenantId(),
    invoiceId,
    userId,
    locationId,
    paymentInfo,
  });
}

export async function cancelPurchase(invoiceId: string, userId: string): Promise<void> {
  return invoke('cancel_purchase', { tenantId: getTenantId(), invoiceId, userId });
}

export async function deletePurchaseDraft(invoiceId: string, userId: string): Promise<void> {
  return invoke('delete_purchase_draft', { tenantId: getTenantId(), invoiceId, userId });
}

export async function returnPurchaseToDraft(invoiceId: string, userId: string): Promise<PurchaseInvoiceDetail> {
  return invoke('return_purchase_to_draft', { tenantId: getTenantId(), invoiceId, userId });
}

export async function updatePurchaseInvoice(
  invoiceId: string,
  data: PurchaseInvoiceCreateData,
): Promise<PurchaseInvoiceDetail> {
  return invoke('update_purchase_invoice', { tenantId: getTenantId(), invoiceId, data });
}

export async function getPaymentSchedules(invoiceId: string): Promise<PaymentSchedule[]> {
  return invoke('get_payment_schedules', { tenantId: getTenantId(), invoiceId });
}

export async function createPaymentSchedule(
  invoiceId: string,
  data: PaymentScheduleData,
): Promise<PaymentSchedule> {
  return invoke('create_payment_schedule', { tenantId: getTenantId(), invoiceId, data });
}

export async function markSchedulePaid(
  scheduleId: string,
  userId: string,
  data: SchedulePaymentData,
): Promise<PaymentSchedule> {
  return invoke('mark_schedule_paid', { tenantId: getTenantId(), scheduleId, userId, data });
}

export async function deletePaymentSchedule(scheduleId: string): Promise<void> {
  return invoke('delete_payment_schedule', { tenantId: getTenantId(), scheduleId });
}

// ====== POS Sessions ======

export async function getActiveSession(branchId: string, userId: string): Promise<PosSession | null> {
  return invoke('get_active_session', { tenantId: getTenantId(), branchId, userId });
}

export async function openSession(
  branchId: string,
  userId: string,
  accountId: string,
  openingCash: number,
): Promise<PosSession> {
  return invoke('open_session', { tenantId: getTenantId(), branchId, userId, accountId, openingCash });
}

export async function closeSession(
  sessionId: string,
  actualCash: number,
  notes?: string,
): Promise<PosSession> {
  return invoke('close_session', { tenantId: getTenantId(), sessionId, actualCash, notes: notes || null });
}

export async function getSessionHistory(
  branchId: string,
  cashierId?: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<SessionRow[]> {
  return invoke('get_session_history', {
    tenantId: getTenantId(),
    branchId,
    cashierId: cashierId || null,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
  });
}

// ====== POS Sales ======

export async function searchProductsPos(branchId: string, query: string): Promise<PosProduct[]> {
  return invoke('search_products_pos', { tenantId: getTenantId(), branchId, query });
}

export async function getPosSubstitutes(branchId: string, productId: string): Promise<PosProduct[]> {
  return invoke('get_pos_substitutes', { tenantId: getTenantId(), branchId, productId });
}

export async function createSale(data: SaleCreateData): Promise<Sale> {
  return invoke('create_sale', {
    tenantId: getTenantId(),
    branchId: data.branchId,
    sessionId: data.sessionId,
    cashierId: data.cashierId,
    paymentMethod: data.paymentMethod,
    paymentMethodId: data.paymentMethodId || null,
    amountPaid: data.amountPaid,
    items: data.items,
    customerId: data.customerId || null,
    discount: data.discount ?? null,
    taxPercent: data.taxPercent ?? null,
    pharmacistOverrideBy: data.pharmacistOverrideBy ?? null,
    notes: data.notes ?? null,
    splitPayments: data.splitPayments ?? null,
  });
}

export async function getSaleDetail(saleId: string): Promise<Sale> {
  return invoke('get_sale_detail', { tenantId: getTenantId(), saleId });
}

export async function getSaleByNumber(saleNumber: string): Promise<Sale> {
  return invoke('get_sale_by_number', { tenantId: getTenantId(), saleNumber });
}

export async function createReturn(data: ReturnCreateData, cashierId: string): Promise<ReturnOut> {
  return invoke('create_return', {
    tenantId: getTenantId(),
    branchId: getBranchId(),
    saleId: data.saleId,
    sessionId: data.sessionId || null,
    returnType: data.returnType,
    refundMethod: data.refundMethod,
    reason: data.reason || null,
    items: data.items,
    createdBy: cashierId,
  });
}

export async function getAccounts(branchId: string): Promise<Account[]> {
  return invoke('get_accounts', { tenantId: getTenantId(), branchId });
}

export async function getSessionSales(sessionId: string): Promise<SessionSaleRow[]> {
  return invoke('get_session_sales', { tenantId: getTenantId(), sessionId });
}

export async function getSessionProductSummary(sessionId: string): Promise<ProductSummaryRow[]> {
  return invoke('get_session_product_summary', { tenantId: getTenantId(), sessionId });
}

export async function getSessionReturns(sessionId: string): Promise<SessionReturnRow[]> {
  return invoke('get_session_returns', { tenantId: getTenantId(), sessionId });
}

export async function savePosWorkspaceState(sessionId: string, stateJson: string): Promise<void> {
  return invoke('save_pos_workspace_state', { tenantId: getTenantId(), sessionId, stateJson });
}

export async function loadPosWorkspaceState(sessionId: string): Promise<string> {
  return invoke('load_pos_workspace_state', { tenantId: getTenantId(), sessionId });
}

export async function clearPosWorkspaceState(sessionId: string): Promise<void> {
  return invoke('clear_pos_workspace_state', { tenantId: getTenantId(), sessionId });
}

export async function createPurchaseReturn(
  invoiceId: string,
  userId: string,
  data: CreatePurchaseReturnData,
): Promise<string> {
  return invoke('create_purchase_return', { tenantId: getTenantId(), invoiceId, userId, data });
}

export async function voidSale(saleId: string, cashierId: string, voidReason?: string): Promise<void> {
  return invoke('void_sale', {
    tenantId: getTenantId(),
    saleId,
    cashierId,
    voidReason: voidReason ?? null,
  });
}
