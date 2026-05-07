import { invoke } from '../lib/tauri';
import type {
  StorageLocationFull, StorageLocationData, StockMovementRow,
  StockTakeRow, StockTakeItemRow, SupplierReturnRow, SupplierReturnCreateData, BatchRow, BatchSaleRow, RecalledBatch,
} from '../types';
import { getTenantId } from './core';

export async function getStorageLocations(branchId: string): Promise<StorageLocationFull[]> {
  return invoke('get_storage_locations', { tenantId: getTenantId(), branchId });
}

export async function createStorageLocation(branchId: string, data: StorageLocationData): Promise<StorageLocationFull> {
  return invoke('create_storage_location', { tenantId: getTenantId(), branchId, data });
}

export async function updateStorageLocation(locationId: string, data: StorageLocationData): Promise<void> {
  return invoke('update_storage_location', { tenantId: getTenantId(), locationId, data });
}

export async function toggleStorageLocationActive(locationId: string): Promise<void> {
  return invoke('toggle_storage_location_active', { tenantId: getTenantId(), locationId });
}

export async function getLocationBatches(locationId: string): Promise<BatchRow[]> {
  return invoke('get_location_batches', { tenantId: getTenantId(), locationId });
}

export async function getStockMovements(
  branchId: string,
  productId?: string,
  movementType?: string,
  dateFrom?: string,
  dateTo?: string,
  limit?: number,
): Promise<StockMovementRow[]> {
  return invoke('get_stock_movements', {
    tenantId: getTenantId(),
    branchId,
    productId: productId || null,
    movementType: movementType || null,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    limit: limit || null,
  });
}

export async function getStockTakes(branchId: string): Promise<StockTakeRow[]> {
  return invoke('get_stock_takes', { tenantId: getTenantId(), branchId });
}

export async function startStockTake(branchId: string, userId: string, notes?: string): Promise<string> {
  return invoke('start_stock_take', { tenantId: getTenantId(), branchId, userId, notes: notes || null });
}

export async function getStockTakeItems(stockTakeId: string): Promise<StockTakeItemRow[]> {
  return invoke('get_stock_take_items', { tenantId: getTenantId(), stockTakeId });
}

export async function updateStockTakeItem(itemId: string, actualQuantity: number): Promise<void> {
  return invoke('update_stock_take_item', { tenantId: getTenantId(), itemId, actualQuantity });
}

export async function confirmStockTake(stockTakeId: string, userId: string): Promise<void> {
  return invoke('confirm_stock_take', { tenantId: getTenantId(), stockTakeId, userId });
}

export async function cancelStockTake(stockTakeId: string): Promise<void> {
  return invoke('cancel_stock_take', { tenantId: getTenantId(), stockTakeId });
}

export async function getSupplierReturns(supplierId?: string): Promise<SupplierReturnRow[]> {
  return invoke('get_supplier_returns', { tenantId: getTenantId(), supplierId: supplierId || null });
}

export async function createSupplierReturn(branchId: string, userId: string, data: SupplierReturnCreateData): Promise<string> {
  return invoke('create_supplier_return', { tenantId: getTenantId(), branchId, userId, data });
}

export async function confirmSupplierReturn(returnId: string, userId: string): Promise<void> {
  return invoke('confirm_supplier_return', { tenantId: getTenantId(), returnId, userId });
}

export async function getInvoiceBatches(invoiceId: string): Promise<BatchRow[]> {
  return invoke('get_invoice_batches', { tenantId: getTenantId(), invoiceId });
}

export async function getBatchSales(batchId: string): Promise<BatchSaleRow[]> {
  return invoke('get_batch_sales', { tenantId: getTenantId(), batchId });
}

export async function transferStock(
  branchId: string,
  userId: string,
  productId: string,
  fromLocationId: string,
  toLocationId: string,
  quantity: number,
): Promise<void> {
  return invoke('transfer_stock', {
    tenantId: getTenantId(),
    branchId,
    userId,
    productId,
    fromLocationId,
    toLocationId,
    quantity,
  });
}

export async function disposeBatch(
  branchId: string,
  userId: string,
  batchId: string,
  quantity: number,
  reason?: string,
): Promise<void> {
  return invoke('dispose_batch', {
    tenantId: getTenantId(),
    branchId,
    userId,
    batchId,
    quantity,
    reason: reason ?? null,
  });
}

export async function recallBatch(
  branchId: string,
  userId: string,
  batchNumber: string,
  reason?: string,
): Promise<RecalledBatch[]> {
  return invoke('recall_batch', {
    tenantId: getTenantId(),
    branchId,
    userId,
    batchNumber,
    reason: reason ?? null,
  });
}
