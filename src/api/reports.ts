import { invoke } from '../lib/tauri';
import type {
  DashboardStats, SalesReport, SalesReportFilters, InventoryReport,
  ExpiryReport, ProfitLossReport, SupplierAgingReport,
  CustomerCreditReport, BalanceSheetSummary, TaxReport,
  InvoiceSaleRow, InvoiceSaleCreateData, Sale,
} from '../types';
import { getTenantId } from './core';

export async function getDashboardStats(branchId: string): Promise<DashboardStats> {
  return invoke('get_dashboard_stats', { tenantId: getTenantId(), branchId });
}

export async function getSalesReport(branchId: string, filters: SalesReportFilters): Promise<SalesReport> {
  return invoke('get_sales_report', { tenantId: getTenantId(), branchId, filters });
}

export async function getInventoryReport(branchId: string): Promise<InventoryReport> {
  return invoke('get_inventory_report', { tenantId: getTenantId(), branchId });
}

export async function getExpiryReport(branchId: string): Promise<ExpiryReport> {
  return invoke('get_expiry_report', { tenantId: getTenantId(), branchId });
}

export async function getProfitLossReport(
  branchId: string,
  dateFrom: string,
  dateTo: string,
): Promise<ProfitLossReport> {
  return invoke('get_profit_loss_report', { tenantId: getTenantId(), branchId, dateFrom, dateTo });
}

export async function getSupplierAgingReport(): Promise<SupplierAgingReport> {
  return invoke('get_supplier_aging_report', { tenantId: getTenantId() });
}

export async function getCustomerCreditReport(): Promise<CustomerCreditReport> {
  return invoke('get_customer_credit_report', { tenantId: getTenantId() });
}

export async function getBalanceSheetSummary(branchId: string): Promise<BalanceSheetSummary> {
  return invoke('get_balance_sheet_summary', { tenantId: getTenantId(), branchId });
}

export async function getTaxReport(
  branchId: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<TaxReport> {
  return invoke('get_tax_report', {
    tenantId: getTenantId(),
    branchId,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
  });
}

// ====== Invoice Sales ======

export async function getInvoiceSales(
  branchId: string,
  customerId?: string,
  paymentStatus?: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<InvoiceSaleRow[]> {
  return invoke('get_invoice_sales', {
    tenantId: getTenantId(),
    branchId,
    customerId: customerId || null,
    paymentStatus: paymentStatus || null,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
  });
}

export async function createInvoiceSale(
  branchId: string,
  cashierId: string,
  data: InvoiceSaleCreateData,
): Promise<Sale> {
  return invoke('create_invoice_sale', {
    tenantId: getTenantId(),
    branchId,
    cashierId,
    customerId: data.customerId || null,
    paymentMethod: data.paymentMethod,
    amountPaid: data.amountPaid,
    accountId: data.accountId,
    discount: data.discount,
    taxAmount: data.taxAmount ?? 0,
    notes: data.notes || null,
    items: data.items,
  });
}
