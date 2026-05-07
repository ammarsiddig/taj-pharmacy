import { invoke } from '../lib/tauri';
import type { ExpenseCategory, ExpenseRow, ExpenseData, ExpenseSummary, ExpenseTemplate, ExpenseTemplateData } from '../types';
import { getTenantId, getBranchId } from './core';

export async function getExpenseCategories(): Promise<ExpenseCategory[]> {
  return invoke('get_expense_categories', { tenantId: getTenantId() });
}

export async function createExpenseCategory(data: { name: string; name_ar: string; color: string; icon: string }): Promise<ExpenseCategory> {
  return invoke('create_expense_category', { tenantId: getTenantId(), data });
}

export async function getExpenses(
  categoryId?: string,
  dateFrom?: string,
  dateTo?: string,
  paymentMethod?: string,
): Promise<ExpenseRow[]> {
  return invoke('get_expenses', {
    tenantId: getTenantId(),
    branchId: getBranchId(),
    categoryId: categoryId || null,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    paymentMethod: paymentMethod || null,
  });
}

export async function createExpense(data: ExpenseData, userId: string): Promise<ExpenseRow> {
  return invoke('create_expense', { tenantId: getTenantId(), branchId: getBranchId(), userId, data });
}

export async function updateExpense(expenseId: string, data: ExpenseData, userId: string): Promise<ExpenseRow> {
  return invoke('update_expense', { tenantId: getTenantId(), branchId: getBranchId(), expenseId, userId, data });
}

export async function deleteExpense(expenseId: string, userId: string): Promise<void> {
  return invoke('delete_expense', { tenantId: getTenantId(), branchId: getBranchId(), expenseId, userId });
}

export async function getExpenseSummary(dateFrom?: string, dateTo?: string): Promise<ExpenseSummary> {
  return invoke('get_expense_summary', {
    tenantId: getTenantId(),
    branchId: getBranchId(),
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
  });
}

export async function getExpenseTemplates(): Promise<ExpenseTemplate[]> {
  return invoke('get_expense_templates', { tenantId: getTenantId() });
}

export async function createExpenseTemplate(data: ExpenseTemplateData): Promise<ExpenseTemplate> {
  return invoke('create_expense_template', { tenantId: getTenantId(), data });
}

export async function deleteExpenseTemplate(templateId: string): Promise<void> {
  return invoke('delete_expense_template', { tenantId: getTenantId(), templateId });
}
