import { invoke } from '../lib/tauri';
import type {
  SupplierRow, SupplierFullData, SupplierDetail as SupplierDetailType,
  SupplierPaymentData, SupplierStatementRow,
} from '../types';
import { getTenantId } from './core';

export async function getSuppliersFull(
  search?: string,
  isActive?: boolean | null,
): Promise<SupplierRow[]> {
  return invoke('get_suppliers_full', {
    tenantId: getTenantId(),
    search: search || null,
    isActive: isActive ?? null,
  });
}

export async function getSupplier(supplierId: string): Promise<SupplierDetailType> {
  return invoke('get_supplier', { tenantId: getTenantId(), supplierId });
}

export async function createSupplierFull(data: SupplierFullData): Promise<SupplierRow> {
  return invoke('create_supplier_full', { tenantId: getTenantId(), data });
}

export async function updateSupplierFull(supplierId: string, data: SupplierFullData): Promise<SupplierRow> {
  return invoke('update_supplier_full', { tenantId: getTenantId(), supplierId, data });
}

export async function toggleSupplierActive(supplierId: string): Promise<SupplierRow> {
  return invoke('toggle_supplier_active', { tenantId: getTenantId(), supplierId });
}

export async function recordSupplierPayment(
  supplierId: string,
  userId: string,
  data: SupplierPaymentData,
): Promise<{ id: string }> {
  return invoke('record_supplier_payment', { tenantId: getTenantId(), supplierId, userId, data });
}

export async function getSupplierStatement(
  supplierId: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<SupplierStatementRow[]> {
  return invoke('get_supplier_statement', {
    tenantId: getTenantId(),
    supplierId,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
  });
}
