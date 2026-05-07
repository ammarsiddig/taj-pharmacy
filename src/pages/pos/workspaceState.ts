import type { CartItem } from '../../types';
import * as api from '../../api';

export type PosPaymentMethod = 'cash' | 'bank_transfer' | 'credit' | 'split';
export type DiscountMode = 'flat' | 'pct';

export interface PosCartWorkspace {
  id: string;
  name: string;
  cart: CartItem[];
  paymentMethod: PosPaymentMethod;
  paymentMethodId: string;
  amountPaid: number;
  selectedCustomerId: string;
  customerSearch: string;
  cartDiscount: number;
  discountMode: DiscountMode;
  discountInput: string;
  saleNote: string;
  splitCashAmount: number;
  splitBankAmount: number;
  splitBankMethodId: string;
  parkedAt?: string;
}

export interface ReceiptPreferences {
  showCustomer: boolean;
  showCashier: boolean;
  showNotes: boolean;
  showPaymentBreakdown: boolean;
  compactMode: boolean;
}

const RECEIPT_PREFS_KEY = 'pms-pos-receipt-prefs-v1';

interface StoredWorkspaceState {
  active: PosCartWorkspace[];
  parked: PosCartWorkspace[];
}

function normalizeMoneyValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `pos-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createWorkspace(index: number): PosCartWorkspace {
  return {
    id: createId(),
    name: `سلة ${index}`,
    cart: [],
    paymentMethod: 'cash',
    paymentMethodId: '',
    amountPaid: 0,
    selectedCustomerId: '',
    customerSearch: '',
    cartDiscount: 0,
    discountMode: 'flat',
    discountInput: '',
    saleNote: '',
    splitCashAmount: 0,
    splitBankAmount: 0,
    splitBankMethodId: '',
  };
}

function normalizeWorkspace(raw: unknown, index: number): PosCartWorkspace {
  const workspace = typeof raw === 'object' && raw !== null ? raw as Partial<PosCartWorkspace> : {};
  return {
    ...createWorkspace(index),
    ...workspace,
    id: typeof workspace.id === 'string' && workspace.id ? workspace.id : createId(),
    name: typeof workspace.name === 'string' && workspace.name ? workspace.name : `سلة ${index}`,
    cart: Array.isArray(workspace.cart) ? workspace.cart as CartItem[] : [],
    paymentMethod: workspace.paymentMethod === 'bank_transfer' || workspace.paymentMethod === 'credit' || workspace.paymentMethod === 'split'
      ? workspace.paymentMethod
      : 'cash',
    paymentMethodId: normalizeText(workspace.paymentMethodId),
    amountPaid: normalizeMoneyValue(workspace.amountPaid),
    selectedCustomerId: normalizeText(workspace.selectedCustomerId),
    customerSearch: normalizeText(workspace.customerSearch),
    cartDiscount: normalizeMoneyValue(workspace.cartDiscount),
    discountMode: workspace.discountMode === 'pct' ? 'pct' : 'flat',
    discountInput: normalizeText(workspace.discountInput),
    saleNote: normalizeText(workspace.saleNote),
    splitCashAmount: normalizeMoneyValue(workspace.splitCashAmount),
    splitBankAmount: normalizeMoneyValue(workspace.splitBankAmount),
    splitBankMethodId: normalizeText(workspace.splitBankMethodId),
    parkedAt: typeof workspace.parkedAt === 'string' ? workspace.parkedAt : undefined,
  };
}

function ensureUniqueWorkspaceIds(active: PosCartWorkspace[], parked: PosCartWorkspace[]) {
  const seen = new Set<string>();
  const assignUniqueId = (workspace: PosCartWorkspace) => {
    if (!workspace.id || seen.has(workspace.id)) {
      workspace.id = createId();
    }
    seen.add(workspace.id);
  };

  active.forEach(assignUniqueId);
  parked.forEach(assignUniqueId);
}

function parseWorkspaceState(json: string): { active: PosCartWorkspace[]; parked: PosCartWorkspace[] } {
  try {
    const parsed = JSON.parse(json) as StoredWorkspaceState;
    const activeInput = parsed.active;
    const parkedInput = parsed.parked;
    const active = Array.isArray(activeInput) ? activeInput.map((item, index) => normalizeWorkspace(item, index + 1)) : [createWorkspace(1)];
    const parked = Array.isArray(parkedInput) ? parkedInput.map((item, index) => normalizeWorkspace(item, index + active.length + 1)) : [];
    ensureUniqueWorkspaceIds(active, parked);
    return { active: active.length > 0 ? active : [createWorkspace(1)], parked };
  } catch {
    return { active: [createWorkspace(1)], parked: [] };
  }
}

export function loadWorkspaceState(_sessionKey = 'no-session'): { active: PosCartWorkspace[]; parked: PosCartWorkspace[] } {
  return { active: [createWorkspace(1)], parked: [] };
}

export async function loadPosWorkspaceStateAsync(sessionId: string): Promise<{ active: PosCartWorkspace[]; parked: PosCartWorkspace[] }> {
  if (sessionId === 'no-session') return { active: [createWorkspace(1)], parked: [] };
  try {
    const json = await api.loadPosWorkspaceState(sessionId);
    if (!json) return { active: [createWorkspace(1)], parked: [] };
    return parseWorkspaceState(json);
  } catch {
    return { active: [createWorkspace(1)], parked: [] };
  }
}

export function saveWorkspaceState(sessionKey = 'no-session', active: PosCartWorkspace[], parked: PosCartWorkspace[]) {
  if (sessionKey === 'no-session') return;
  const stateJson = JSON.stringify({ active, parked } satisfies StoredWorkspaceState);
  api.savePosWorkspaceState(sessionKey, stateJson).catch(() => { /* fire-and-forget */ });
}

export function clearWorkspaceState(sessionKey = 'no-session') {
  if (sessionKey === 'no-session') return;
  api.clearPosWorkspaceState(sessionKey).catch(() => { /* fire-and-forget */ });
}

export function loadReceiptPreferences(): ReceiptPreferences {
  if (typeof window === 'undefined') {
    return {
      showCustomer: true,
      showCashier: true,
      showNotes: true,
      showPaymentBreakdown: true,
      compactMode: false,
    };
  }

  try {
    const raw = window.localStorage.getItem(RECEIPT_PREFS_KEY);
    if (!raw) throw new Error('missing');
    return {
      showCustomer: true,
      showCashier: true,
      showNotes: true,
      showPaymentBreakdown: true,
      compactMode: false,
      ...(JSON.parse(raw) as Partial<ReceiptPreferences>),
    };
  } catch {
    return {
      showCustomer: true,
      showCashier: true,
      showNotes: true,
      showPaymentBreakdown: true,
      compactMode: false,
    };
  }
}

export function saveReceiptPreferences(preferences: ReceiptPreferences) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RECEIPT_PREFS_KEY, JSON.stringify(preferences));
}
