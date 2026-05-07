export interface StorageLocationFull {
  id: string;
  tenant_id: string;
  branch_id: string;
  name: string;
  name_ar?: string;
  location_type: 'shelf' | 'fridge' | 'warehouse';
  location_code?: string;
  is_active: boolean;
  item_count: number;
}

export interface StorageLocationData {
  name: string;
  name_ar?: string;
  location_type: 'shelf' | 'fridge' | 'warehouse';
  location_code?: string;
}

export interface StockMovementRow {
  id: string;
  product_id: string;
  product_name: string;
  batch_id: string;
  batch_number?: string;
  movement_type: string;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  reference_type?: string;
  reference_id?: string;
  notes?: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
}

export interface StockTakeRow {
  id: string;
  branch_id: string;
  started_by: string;
  started_by_name: string;
  confirmed_by?: string;
  status: 'in_progress' | 'completed' | 'cancelled';
  started_at: string;
  completed_at?: string;
  notes?: string;
  item_count: number;
  discrepancy_count: number;
}

export interface StockTakeItemRow {
  id: string;
  stock_take_id: string;
  product_id: string;
  product_name: string;
  product_name_ar?: string;
  batch_id: string;
  batch_number?: string;
  expiry_date?: string;
  expected_quantity: number;
  actual_quantity: number;
  difference: number;
  adjustment_applied: boolean;
}

export interface BatchSaleRow {
  sale_id: string;
  sale_number: string;
  sale_date: string;
  customer_id?: string;
  customer_name?: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface RecalledBatch {
  id: string;
  product_id: string;
  product_name: string;
  batch_number?: string;
  location_id: string;
  location_name: string;
  quantity_recalled: number;
}

export interface BatchRow {
  id: string;
  product_id: string;
  product_name: string;
  product_name_ar?: string;
  location_id: string;
  location_name: string;
  supplier_invoice_id?: string;
  batch_number?: string;
  expiry_date?: string;
  quantity_received: number;
  quantity_current: number;
  unit_cost: number;
  status: string;
}
