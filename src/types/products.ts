export interface Product {
  id: string;
  tenant_id: string;
  barcode?: string;
  trade_name: string;
  trade_name_ar?: string;
  generic_name?: string;
  generic_name_ar?: string;
  category?: string;
  unit: string;
  unit_id?: string;
  enable_sub_units: boolean;
  sub_unit_id?: string;
  sub_unit_ratio?: number;
  sale_price: number;
  min_sale_price: number;
  last_purchase_price: number;
  min_stock_level: number;
  is_active: boolean;
  notes?: string;
  manufacturer?: string;
  active_ingredient?: string;
  dosage_form?: string;
  storage_conditions?: string;
  is_prescription: boolean;
  total_stock?: number;
  created_at: string;
  updated_at: string;
}

export interface StorageLocation {
  id: string;
  tenant_id: string;
  branch_id: string;
  name: string;
  name_ar?: string;
  location_type: 'shelf' | 'fridge' | 'warehouse';
  location_code?: string;
  is_active: boolean;
}

export type ProductFormData = {
  trade_name: string;
  trade_name_ar?: string;
  generic_name?: string;
  generic_name_ar?: string;
  barcode?: string;
  category?: string;
  unit_id: string;
  enable_sub_units?: boolean;
  sub_unit_id?: string;
  sub_unit_ratio?: number;
  sale_price: number;
  min_sale_price: number;
  min_stock_level: number;
  notes?: string;
  manufacturer?: string;
  active_ingredient?: string;
  dosage_form?: string;
  storage_conditions?: string;
  is_prescription?: boolean;
};

export type ProductImportRowData = {
  trade_name: string;
  trade_name_ar?: string;
  generic_name?: string;
  generic_name_ar?: string;
  barcode?: string;
  category?: string;
  unit?: string;
  sale_price: number;
  min_sale_price?: number;
  last_purchase_price?: number;
  min_stock_level?: number;
  notes?: string;
};

export interface ProductImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
}

export interface ProductSubstitute {
  id: string;
  substitute_id: string;
  trade_name: string;
  trade_name_ar?: string;
  generic_name?: string;
  total_stock: number;
  sale_price: number;
  notes?: string;
}

export interface UnitMeasure {
  id: string;
  name: string;
  name_ar?: string;
  is_active: boolean;
}

export interface UnitMeasureData {
  name: string;
  name_ar?: string;
  is_active?: boolean;
}

export interface PaymentMethodSetting {
  id: string;
  name: string;
  name_ar?: string;
  method_type: 'cash' | 'bank_transfer' | 'credit';
  account_id?: string;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface PaymentMethodData {
  name: string;
  name_ar?: string;
  method_type: 'cash' | 'bank_transfer' | 'credit';
  account_id?: string;
  is_default?: boolean;
  is_active?: boolean;
  sort_order?: number;
}
