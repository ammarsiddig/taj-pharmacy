export interface ExpenseCategory {
  id: string;
  name: string;
  name_ar: string;
  color: string;
  icon: string;
}

export interface ExpenseRow {
  id: string;
  amount: number;
  description: string;
  category_id?: string;
  category_name: string;
  category_name_ar: string;
  category_color: string;
  payment_method: string;
  account_id: string;
  account_name: string;
  created_by_name: string;
  expense_date: string;
  notes?: string;
  created_at: string;
}

export interface ExpenseData {
  amount: number;
  description: string;
  category_id: string;
  payment_method: string;
  account_id: string;
  expense_date: string;
  notes?: string;
}

export interface CategorySummary {
  category_name: string;
  category_name_ar: string;
  category_color: string;
  total: number;
}

export interface ExpenseSummary {
  total: number;
  today: number;
  this_month: number;
  by_category: CategorySummary[];
}

export interface ExpenseTemplate {
  id: string;
  name: string;
  name_ar?: string;
  category_id?: string;
  category_name?: string;
  category_name_ar?: string;
  category_color?: string;
  default_amount: number;
  payment_method: string;
  account_id?: string;
  sort_order: number;
}

export interface ExpenseTemplateData {
  name: string;
  name_ar?: string;
  category_id?: string;
  default_amount: number;
  payment_method: string;
  account_id?: string;
}
