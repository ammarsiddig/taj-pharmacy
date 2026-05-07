import { invoke } from '../lib/tauri';
import type {
  CustomerRow, CustomerData, CustomerDetail,
  CustomerPaymentData, CustomerPaymentRow, StatementRow,
} from '../types';
import { getTenantId } from './core';

export async function getCustomers(
  search?: string,
  isActive?: boolean | null,
  hasBalance?: boolean | null,
): Promise<CustomerRow[]> {
  return invoke('get_customers', {
    tenantId: getTenantId(),
    search: search || null,
    isActive: isActive ?? null,
    hasBalance: hasBalance ?? null,
  });
}

export async function getCustomer(customerId: string): Promise<CustomerDetail> {
  return invoke('get_customer', { tenantId: getTenantId(), customerId });
}

export async function createCustomer(data: CustomerData): Promise<CustomerRow> {
  return invoke('create_customer', { tenantId: getTenantId(), data });
}

export async function updateCustomer(customerId: string, data: CustomerData): Promise<CustomerRow> {
  return invoke('update_customer', { tenantId: getTenantId(), customerId, data });
}

export async function toggleCustomerActive(customerId: string): Promise<CustomerRow> {
  return invoke('toggle_customer_active', { tenantId: getTenantId(), customerId });
}

export async function recordCustomerPayment(
  customerId: string,
  userId: string,
  data: CustomerPaymentData,
): Promise<CustomerPaymentRow> {
  return invoke('record_customer_payment', { tenantId: getTenantId(), customerId, userId, data });
}

export async function getCustomerStatement(
  customerId: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<StatementRow[]> {
  return invoke('get_customer_statement', {
    tenantId: getTenantId(),
    customerId,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
  });
}
