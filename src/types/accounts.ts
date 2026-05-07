export interface AccountRow {
  id: string;
  name: string;
  name_ar?: string;
  account_type: string;
  current_balance: number;
  is_default: boolean;
  is_active: boolean;
}

export interface AccountData {
  name: string;
  name_ar?: string;
  account_type: string;
  opening_balance?: number;
  is_default?: boolean;
}

export interface LedgerRow {
  id: string;
  created_at: string;
  transaction_type: string;
  direction: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  reference_type?: string;
  reference_id?: string;
  description?: string;
}

export interface AccountLedger {
  account: AccountRow;
  transactions: LedgerRow[];
  total_in: number;
  total_out: number;
}

export interface AccountsSummary {
  total_cash: number;
  total_bank: number;
  total_assets: number;
  accounts: AccountRow[];
}

export interface TransferData {
  from_account_id: string;
  to_account_id: string;
  amount: number;
  notes?: string;
}
