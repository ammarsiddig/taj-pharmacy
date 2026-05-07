export interface DashboardDailySales {
  date: string;
  total: number;
}

export interface OverdueSupplier {
  supplier_name: string;
  balance_due: number;
  days_overdue: number;
}

export interface TopProduct {
  product_name: string;
  total_qty: number;
  total_revenue: number;
}

export interface OpenSession {
  cashier_name: string;
  opened_at: string;
  sales_count: number;
  total_sales: number;
}

export interface RecentSale {
  sale_number: string;
  total: number;
  payment_method: string;
  created_at: string;
}

export interface DashboardStats {
  today_sales_total: number;
  today_sales_count: number;
  today_avg_sale: number;
  yesterday_sales_total: number;
  sales_change_pct: number;
  month_sales_total: number;
  month_expenses_total: number;
  month_gross_profit: number;
  month_net_profit: number;
  low_stock_count: number;
  out_of_stock_count: number;
  expiring_30_count: number;
  expired_count: number;
  total_cash_balance: number;
  total_bank_balance: number;
  supplier_payables: number;
  customer_receivables: number;
  overdue_suppliers: OverdueSupplier[];
  top_products: TopProduct[];
  open_sessions: OpenSession[];
  recent_sales: RecentSale[];
  last_7_days_sales: DashboardDailySales[];
}

export interface SalesReportFilters {
  date_from: string;
  date_to: string;
  group_by: 'day' | 'week' | 'month' | 'product' | 'cashier';
  cashier_id?: string;
}

export interface SalesReportRow {
  label: string;
  date?: string;
  product_name?: string;
  cashier_name?: string;
  count: number;
  quantity: number;
  revenue: number;
  profit: number;
}

export interface PaymentBreakdown {
  cash_total: number;
  bank_transfer_total: number;
  credit_total: number;
}

export interface SalesReport {
  date_from: string;
  date_to: string;
  total_revenue: number;
  total_cost: number;
  gross_profit: number;
  profit_margin: number;
  total_sales_count: number;
  avg_sale_value: number;
  rows: SalesReportRow[];
  payment_breakdown: PaymentBreakdown;
}

export interface InventoryStockItem {
  product_name: string;
  current_qty: number;
  min_stock_level: number;
  last_purchase_price: number;
}

export interface DeadStockItem {
  product_name: string;
  current_qty: number;
  stock_value: number;
  last_movement_date?: string;
}

export interface LocationStock {
  location_name: string;
  location_type: string;
  product_count: number;
  total_qty: number;
  total_value: number;
}

export interface InventoryReport {
  total_products: number;
  total_stock_value: number;
  total_stock_cost: number;
  total_potential_revenue: number;
  low_stock_items: InventoryStockItem[];
  out_of_stock_items: InventoryStockItem[];
  dead_stock_items: DeadStockItem[];
  by_location: LocationStock[];
}

export interface ExpiryItem {
  product_name: string;
  batch_number?: string;
  expiry_date: string;
  quantity_current: number;
  location_name: string;
  stock_value: number;
  days_until_expiry: number;
}

export interface ExpiryReport {
  expired: ExpiryItem[];
  expiring_7: ExpiryItem[];
  expiring_30: ExpiryItem[];
  expiring_60: ExpiryItem[];
  expiring_90: ExpiryItem[];
  total_at_risk_value: number;
}

export interface ProfitLossExpenseCategory {
  category_name: string;
  amount: number;
}

export interface ProfitLossReport {
  period: string;
  gross_sales: number;
  returns_total: number;
  net_sales: number;
  cogs: number;
  gross_profit: number;
  gross_margin: number;
  total_expenses: number;
  expenses_by_category: ProfitLossExpenseCategory[];
  net_profit: number;
  net_margin: number;
}

export interface AgingRow {
  supplier_name: string;
  current: number;
  days_30: number;
  days_60: number;
  days_90_plus: number;
  total: number;
}

export interface SupplierAgingReport {
  total_payables: number;
  rows: AgingRow[];
}

export interface CustomerCreditRow {
  customer_name: string;
  phone?: string;
  credit_limit: number;
  current_balance: number;
  utilization_pct: number;
  last_purchase_date?: string;
  status: 'normal' | 'warning' | 'over_limit';
}

export interface CustomerCreditReport {
  total_receivables: number;
  over_limit_count: number;
  rows: CustomerCreditRow[];
}

export interface AccountBalance {
  name: string;
  name_ar?: string;
  account_type: string;
  current_balance: number;
}

export interface BalanceSheetSummary {
  accounts: AccountBalance[];
  total_cash: number;
  total_bank: number;
  cash_and_bank: number;
  inventory_value: number;
  customer_receivables: number;
  total_assets: number;
  supplier_payables: number;
  total_liabilities: number;
  net_equity: number;
}

export interface TaxReportRow {
  sale_number: string;
  sale_type: string;
  customer_name?: string;
  subtotal: number;
  discount: number;
  tax_amount: number;
  total: number;
  payment_method: string;
  created_at: string;
}

export interface TaxReport {
  rows: TaxReportRow[];
  total_subtotal: number;
  total_discount: number;
  total_tax: number;
  total_net: number;
  taxable_sales_count: number;
  exempt_sales_count: number;
}
