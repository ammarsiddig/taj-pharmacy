import { invoke } from '../lib/tauri';
import type { AccountRow, AccountData, UpdateAccountData, AccountLedger, AccountsSummary, TransferData, TransferFeePreview } from '../types';
import { getTenantId } from './core';

export async function getAllAccounts(branchId: string): Promise<AccountRow[]> {
  return invoke('get_all_accounts', { tenantId: getTenantId(), branchId });
}

export async function createAccount(branchId: string, userId: string, data: AccountData): Promise<AccountRow> {
  return invoke('create_account', { tenantId: getTenantId(), branchId, userId, data });
}

export async function updateAccount(userId: string, accountId: string, data: UpdateAccountData): Promise<AccountRow> {
  return invoke('update_account', { tenantId: getTenantId(), userId, accountId, data });
}

export async function getAccountLedger(
  accountId: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<AccountLedger> {
  return invoke('get_account_ledger', {
    tenantId: getTenantId(),
    accountId,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
  });
}

export async function getAccountsSummary(branchId: string): Promise<AccountsSummary> {
  return invoke('get_accounts_summary', { tenantId: getTenantId(), branchId });
}

export async function getTransferFeePreview(
  fromAccountId: string,
  toAccountId: string,
  amount: number,
): Promise<TransferFeePreview> {
  return invoke('get_transfer_fee_preview', {
    tenantId: getTenantId(),
    fromAccountId,
    toAccountId,
    amount,
  });
}

export async function manualTransfer(userId: string, data: TransferData): Promise<string> {
  return invoke('manual_transfer', { tenantId: getTenantId(), userId, data });
}
