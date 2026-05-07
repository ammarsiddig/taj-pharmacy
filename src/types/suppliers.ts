export interface Supplier {
  id: string;
  tenant_id: string;
  name: string;
  name_ar?: string;
  phone?: string;
  email?: string;
  address?: string;
  contact_person?: string;
  opening_balance: number;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type SupplierFormData = {
  name: string;
  name_ar?: string;
  phone?: string;
  email?: string;
  address?: string;
  contact_person?: string;
  opening_balance: number;
  notes?: string;
};

export interface SupplierRow {
  id: string;
  name: string;
  name_ar?: string;
  phone?: string;
  email?: string;
  address?: string;
  contact_person?: string;
  total_invoices: number;
  total_purchased: number;
  total_paid: number;
  balance_due: number;
  overdue_amount: number;
  last_purchase_date?: string;
  is_active: boolean;
  notes?: string;
}

export interface SupplierFullData {
  name: string;
  name_ar?: string;
  phone?: string;
  email?: string;
  address?: string;
  contact_person?: string;
  notes?: string;
}

export interface SupplierInvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total: number;
  amount_paid: number;
  status: string;
  payment_status: string;
  created_at: string;
}

export interface SupplierPaymentRow {
  id: string;
  amount: number;
  payment_method: string;
  account_name: string;
  invoice_number?: string;
  payment_date: string;
  notes?: string;
  created_by_name: string;
  created_at: string;
}

export interface SupplierDetail {
  id: string;
  name: string;
  name_ar?: string;
  phone?: string;
  email?: string;
  address?: string;
  contact_person?: string;
  total_invoices: number;
  total_purchased: number;
  total_paid: number;
  balance_due: number;
  overdue_amount: number;
  last_purchase_date?: string;
  is_active: boolean;
  notes?: string;
  recent_invoices: SupplierInvoiceRow[];
  recent_payments: SupplierPaymentRow[];
}

export interface SupplierPaymentData {
  amount: number;
  payment_method: string;
  account_id: string;
  invoice_id?: string;
  payment_date: string;
  notes?: string;
}

export interface SupplierStatementRow {
  date: string;
  row_type: string;
  description: string;
  debit: number;
  credit: number;
  running_balance: number;
}

export interface SupplierReturnRow {
  id: string;
  supplier_id: string;
  supplier_name: string;
  invoice_id: string;
  invoice_number?: string;
  return_number: string;
  return_date: string;
  total_amount: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  reason?: string;
  created_by_name: string;
  created_at: string;
  item_count: number;
}

export interface SupplierReturnItemData {
  product_id: string;
  batch_id: string;
  quantity: number;
  unit_cost: number;
  reason?: string;
}

export interface SupplierReturnCreateData {
  supplier_id: string;
  invoice_id: string;
  return_date: string;
  reason?: string;
  notes?: string;
  items: SupplierReturnItemData[];
}
