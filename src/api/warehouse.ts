import { invoke } from '../lib/tauri';
import type {
  StorageLocationFull, StorageLocationData, StockMovementRow,
  StockTakeRow, StockTakeItemRow, SupplierReturnRow, SupplierReturnCreateData, BatchRow, BatchSaleRow, RecalledBatch, LowStockProduct,
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

export async function getLowStockProducts(branchId: string): Promise<LowStockProduct[]> {
  return invoke('get_low_stock_products', { tenantId: getTenantId(), branchId });
}

// ─── Opening Stock (الجرد الافتتاحي) ─────────────────────────────────────────

export interface SetupModeStatus { setup_mode: boolean }

export interface OpeningStockEntry {
  product_id: string;
  location_id: string;
  quantity: number;
  unit_cost?: number | null;
  batch_number?: string | null;
  expiry_date?: string | null;
}

export interface OpeningStockResult { batch_id: string; movement_id: string }

export interface BulkOpeningStockRow {
  barcode?: string | null;
  trade_name?: string | null;
  trade_name_ar?: string | null;
  generic_name?: string | null;
  category?: string | null;
  unit?: string | null;
  sale_price?: number | null;
  quantity: number;
  unit_cost?: number | null;
  batch_number?: string | null;
  expiry_date?: string | null;
  location_id?: string | null;
}

export interface BulkOpeningStockRowResult {
  row_index: number;
  success: boolean;
  product_id: string | null;
  batch_id: string | null;
  created_product: boolean;
  error: string | null;
}

export interface BulkOpeningStockResult {
  total: number;
  success_count: number;
  error_count: number;
  created_products: number;
  rows: BulkOpeningStockRowResult[];
}

export async function getSetupMode(): Promise<SetupModeStatus> {
  return invoke('get_setup_mode', { tenantId: getTenantId() });
}

export async function finalizeSetupMode(userId: string): Promise<void> {
  return invoke('finalize_setup_mode', { tenantId: getTenantId(), userId });
}

export async function addOpeningStockBatch(
  branchId: string,
  userId: string,
  entry: OpeningStockEntry,
): Promise<OpeningStockResult> {
  return invoke('add_opening_stock_batch', {
    tenantId: getTenantId(), branchId, userId, entry,
  });
}

export async function importOpeningStockBulk(
  branchId: string,
  userId: string,
  rows: BulkOpeningStockRow[],
): Promise<BulkOpeningStockResult> {
  return invoke('import_opening_stock_bulk', {
    tenantId: getTenantId(), branchId, userId, rows,
  });
}
