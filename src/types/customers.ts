export interface CustomerRow {
  id: string;
  name: string;
  name_ar?: string;
  phone?: string;
  email?: string;
  address?: string;
  credit_limit: number;
  current_balance: number;
  total_purchases: number;
  last_purchase_date?: string;
  is_active: boolean;
  notes?: string;
}

export interface CustomerData {
  name: string;
  name_ar?: string;
  phone?: string;
  email?: string;
  address?: string;
  credit_limit: number;
  notes?: string;
}

export interface CustomerPaymentRow {
  id: string;
  amount: number;
  payment_method: string;
  account_name: string;
  notes?: string;
  created_by_name: string;
  created_at: string;
}

export interface CustomerSaleRow {
  id: string;
  sale_number: string;
  total: number;
  payment_method: string;
  created_at: string;
}

export interface CustomerDetail {
  id: string;
  name: string;
  name_ar?: string;
  phone?: string;
  email?: string;
  address?: string;
  credit_limit: number;
  current_balance: number;
  total_purchases: number;
  last_purchase_date?: string;
  is_active: boolean;
  notes?: string;
  recent_sales: CustomerSaleRow[];
  recent_payments: CustomerPaymentRow[];
}

export interface CustomerPaymentData {
  amount: number;
  payment_method: string;
  account_id: string;
  notes?: string;
}

export interface StatementRow {
  date: string;
  row_type: string;
  description: string;
  debit: number;
  credit: number;
  running_balance: number;
}
