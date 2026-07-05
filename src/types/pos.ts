export interface PurchaseInvoiceRow {
  id: string;
  invoice_number: string;
  supplier_name: string;
  invoice_date: string;
  items_count: number;
  total: number;
  amount_paid: number;
  status: 'draft' | 'confirmed' | 'cancelled';
  payment_status: 'unpaid' | 'partial' | 'paid';
  has_overdue_schedule: boolean;
  created_at: string;
}

export interface PaymentSchedule {
  id: string;
  invoice_id: string;
  due_date: string;
  amount: number;
  note?: string;
  is_paid: boolean;
  paid_at?: string;
  payment_id?: string;
  account_id?: string;
  created_at: string;
}

export type PaymentScheduleData = {
  due_date: string;
  amount: number;
  note?: string;
};

export type ConfirmPurchasePaymentData = {
  payment_mode: 'unpaid' | 'paid' | 'partial';
  account_id?: string;
  payment_method?: string;
  payment_date?: string;
  amount_paid?: number;
  notes?: string;
};

export type SchedulePaymentData = {
  account_id: string;
  payment_method: string;
  payment_date: string;
  notes?: string;
};

export interface PurchaseInvoiceItem {
  id: string;
  product_id: string;
  product_name: string;
  batch_number?: string;
  expiry_date?: string;
  quantity: number;
  unit_cost: number;
  sale_price: number;
  subtotal: number;
}

export interface PurchaseInvoiceDetail {
  id: string;
  invoice_number: string;
  supplier_id: string;
  supplier_name: string;
  invoice_date: string;
  status: 'draft' | 'confirmed' | 'cancelled';
  payment_status: 'unpaid' | 'partial' | 'paid';
  subtotal: number;
  discount: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  notes?: string;
  items: PurchaseInvoiceItem[];
}

export interface PurchaseReturnItemData {
  batch_id: string;
  quantity: number;
  reason?: string;
}

export interface CreatePurchaseReturnData {
  return_date: string;
  reason?: string;
  notes?: string;
  account_id?: string;
  items: PurchaseReturnItemData[];
}

export interface PurchaseInvoiceCreateData {
  supplier_id: string;
  invoice_date: string;
  invoice_number?: string;
  notes?: string;
  discount?: number;
  tax_amount?: number;
  items: {
    product_id: string;
    batch_number?: string;
    expiry_date?: string;
    quantity: number;
    unit_cost: number;
    sale_price: number;
  }[];
}

export interface PosSession {
  id: string;
  tenant_id: string;
  branch_id: string;
  cashier_id: string;
  account_id: string;
  status: 'open' | 'closed';
  opening_cash: number;
  expected_cash: number;
  actual_cash?: number;
  cash_difference?: number;
  total_sales: number;
  total_returns: number;
  sales_count: number;
  opened_at: string;
  closed_at?: string;
  notes?: string;
}

export interface PosBatch {
  batch_id: string;
  batch_number?: string;
  expiry_date?: string;
  quantity_current: number;
  unit_cost: number;
  location_name?: string;
}

export interface PosProduct {
  product_id: string;
  product_name: string;
  product_name_ar?: string;
  barcode?: string;
  sale_price: number;
  unit: string;
  is_prescription: boolean;
  batches: PosBatch[];
}

export interface SaleItem {
  id: string;
  product_id: string;
  batch_id: string;
  product_name?: string;
  batch_number?: string;
  expiry_date?: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  subtotal: number;
}

export interface SalePayment {
  id: string;
  payment_method: 'cash' | 'bank_transfer';
  payment_method_id?: string;
  payment_method_name?: string;
  amount: number;
}

export interface Sale {
  id: string;
  sale_number: string;
  sale_type: 'pos' | 'invoice';
  session_id?: string;
  cashier_id: string;
  customer_id?: string;
  customer_name?: string;
  subtotal: number;
  discount: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  change_amount: number;
  payment_method: 'cash' | 'bank_transfer' | 'credit' | 'partial';
  payment_method_id?: string;
  payment_method_name?: string;
  payment_status: 'paid' | 'credit' | 'partial';
  notes?: string;
  split_payments: SalePayment[];
  items: SaleItem[];
  created_at: string;
}

export interface SaleCreateData {
  branchId: string;
  sessionId: string;
  cashierId: string;
  paymentMethod: 'cash' | 'bank_transfer' | 'credit' | 'partial';
  paymentMethodId?: string;
  amountPaid: number;
  customerId?: string;
  discount?: number;
  taxPercent?: number;
  pharmacistOverrideBy?: string;
  notes?: string;
  splitPayments?: {
    payment_method: 'cash' | 'bank_transfer';
    payment_method_id?: string;
    amount: number;
  }[];
  items: {
    product_id: string;
    batch_id?: string;
    quantity: number;
    unit_price: number;
    unit_cost: number;
  }[];
}

export interface SessionRow {
  id: string;
  cashier_name: string;
  opened_at: string;
  closed_at?: string;
  sales_count: number;
  total_sales: number;
  total_returns: number;
  opening_cash: number;
  actual_cash?: number;
  cash_difference?: number;
  status: 'open' | 'closed';
}

export interface Account {
  id: string;
  tenant_id: string;
  branch_id: string;
  name: string;
  name_ar?: string;
  account_type: 'cash' | 'bank';
  current_balance: number;
  is_default: boolean;
  is_active: boolean;
}

export interface CartItem {
  product_id: string;
  product_name: string;
  product_name_ar?: string;
  is_prescription: boolean;
  batch_id: string;
  batch_number?: string;
  expiry_date?: string;
  quantity: number;
  max_quantity: number;
  unit_price: number;
  unit_cost: number;
  subtotal: number;
}

export interface SessionSaleRow {
  id: string;
  sale_number: string;
  total: number;
  payment_method: string;
  items_count: number;
  customer_name?: string;
  created_at: string;
}

export interface ProductSummaryRow {
  product_id: string;
  product_name: string;
  total_qty: number;
  total_returned: number;
  net_qty: number;
  unit_price: number;
  unit_cost: number;
  total_amount: number;
  net_amount: number;
  profit: number;
}

export interface ReturnItemOut {
  id: string;
  product_id: string;
  product_name: string;
  batch_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface ReturnOut {
  id: string;
  return_number: string;
  sale_id?: string;
  sale_number: string;
  return_type: 'full' | 'partial';
  total: number;
  refund_method: 'cash' | 'bank_transfer' | 'none';
  status: string;
  reason?: string;
  items: ReturnItemOut[];
  created_at: string;
}

export interface ReturnCreateData {
  saleId: string;
  sessionId?: string;
  returnType: 'full' | 'partial';
  refundMethod: 'cash' | 'bank_transfer' | 'none';
  reason?: string;
  items: {
    sale_item_id: string;
    product_id: string;
    batch_id: string;
    quantity: number;
    unit_price: number;
  }[];
}

export interface SessionReturnRow {
  id: string;
  return_number: string;
  sale_number: string;
  return_type: string;
  total: number;
  refund_method: string;
  created_at: string;
}

export interface InvoiceSaleRow {
  id: string;
  sale_number: string;
  customer_id?: string;
  customer_name?: string;
  cashier_name: string;
  total: number;
  tax_amount: number;
  amount_paid: number;
  balance_due: number;
  payment_method: string;
  payment_status: 'paid' | 'credit' | 'partial';
  notes?: string;
  created_at: string;
  items_count: number;
}

export interface InvoiceSaleCreateData {
  customerId?: string;
  paymentMethod: 'cash' | 'bank_transfer' | 'credit' | 'partial';
  amountPaid: number;
  accountId: string;
  discount: number;
  taxAmount?: number;
  notes?: string;
  items: {
    product_id: string;
    batch_id?: string;
    quantity: number;
    unit_price: number;
    unit_cost: number;
  }[];
}
