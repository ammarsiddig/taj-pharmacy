import type { AuthState } from '../types';
import { invoke } from '../lib/tauri';

const DEFAULT_TENANT_ID = 'default-tenant';
const DEFAULT_BRANCH_ID = 'main-branch';

let _cachedDbTenantId: string | null = null;
let _cachedDbBranchId: string | null = null;

async function resolveDbIdentity() {
  if (_cachedDbTenantId !== null) return;
  try {
    const result = await invoke<{ tenant_id: string; branch_id: string }>('get_db_tenant_id', {});
    _cachedDbTenantId = result.tenant_id;
    _cachedDbBranchId = result.branch_id;
  } catch {
    _cachedDbTenantId = DEFAULT_TENANT_ID;
    _cachedDbBranchId = DEFAULT_BRANCH_ID;
  }
}

function getStoredAuthState(): AuthState | null {
  const stored = localStorage.getItem('pms-auth');
  if (!stored) return null;
  try {
    return JSON.parse(stored) as AuthState;
  } catch {
    return null;
  }
}

function getAuthenticatedState(): AuthState | null {
  const state = getStoredAuthState();
  if (!state?.isAuthenticated || !state.user || !state.token) return null;
  return state;
}

export function getTenantId() {
  return getAuthenticatedState()?.tenant_id || _cachedDbTenantId || DEFAULT_TENANT_ID;
}

export function getBranchId() {
  return getAuthenticatedState()?.user?.branch_id || _cachedDbBranchId || DEFAULT_BRANCH_ID;
}

export async function initTenantId() {
  await resolveDbIdentity();
}

export function getAuthState(): AuthState {
  const stored = localStorage.getItem('pms-auth');
  if (stored) {
    try { return JSON.parse(stored); } catch { /* ignore */ }
  }
  return {
    user: null,
    role: null,
    permissions: [],
    token: null,
    tenant_id: DEFAULT_TENANT_ID,
    isAuthenticated: false,
  };
}

export function setAuthState(state: AuthState) {
  localStorage.setItem('pms-auth', JSON.stringify(state));
}

export function clearAuthState() {
  localStorage.removeItem('pms-auth');
}

export function formatMoney(piasters: number): string {
  return (piasters / 100).toFixed(2);
}

// Credit limit uses sentinel semantics: -1 = unlimited, 0 = cash-only, >0 = a real
// limit. A -1 must never render as a negative money value — show the unlimited label.
// The label is passed in so this stays free of the i18n layer.
export function formatCreditLimit(piasters: number, unlimitedLabel: string): string {
  return piasters < 0 ? unlimitedLabel : formatMoney(piasters);
}

const RECEIPT_PRINT_CSS = `
  @page { size: 80mm auto; margin: 0; }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { width: 80mm; margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: 'Courier New', Courier, monospace; font-size: 10px; line-height: 1.4; }
  .print-receipt { display: block !important; width: 80mm; padding: 2mm 3mm; }
  .hidden { display: none !important; }
  img { max-width: 60mm; max-height: 40px; display: block; margin: 0 auto; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 1px 2px; }
  .text-center { text-align: center; }
  .text-right { text-align: right; }
  .text-left { text-align: left; }
  .font-bold { font-weight: 700; }
  .font-semibold { font-weight: 600; }
  .tabular-nums { font-variant-numeric: tabular-nums; }
  .text-xs { font-size: 10px; }
  .text-sm { font-size: 11px; }
  .text-\\[9px\\] { font-size: 9px; }
  .text-\\[10px\\] { font-size: 10px; }
  .opacity-70 { opacity: 0.7; }
  .whitespace-pre-line { white-space: pre-line; }
  .flex { display: flex; }
  .justify-between { justify-content: space-between; }
  .items-center { align-items: center; }
  .w-full { width: 100%; }
  .w-8 { width: 2rem; }
  .w-14 { width: 3.5rem; }
  .mx-auto { margin-left: auto; margin-right: auto; }
  .mb-1 { margin-bottom: 0.25rem; }
  .mb-2 { margin-bottom: 0.5rem; }
  .mt-0\\.5 { margin-top: 0.125rem; }
  .mt-1 { margin-top: 0.25rem; }
  .my-1 { margin: 0.25rem 0; }
  .my-2 { margin: 0.5rem 0; }
  .py-0\\.5 { padding: 0.125rem 0; }
  .p-2 { padding: 0.5rem; }
  .border-t { border-top: 1px solid #000; }
  .border-b { border-bottom: 1px solid #000; }
  .border-black { border-color: #000; }
  .border-dashed { border-style: dashed; }
  .border-dotted { border-style: dotted; }
  .border-gray-300 { border-color: #d1d5db; }
  .bg-white { background: #fff; }
`;

/**
 * Derives the correct payment_method value from an account's type.
 * account_type 'bank'  → 'bank_transfer'
 * account_type 'cash'  → 'cash'
 * Mirrors the backend derivation in do_supplier_payment.
 */
export function paymentMethodFromAccountType(accountType: string): 'cash' | 'bank_transfer' {
  return accountType === 'bank' ? 'bank_transfer' : 'cash';
}

/** Extracts a display message from Tauri errors (strings) or JS Error objects. */
export function errMsg(e: unknown, fallback: string): string {
  if (typeof e === 'string' && e.length > 0) return e;
  if (e instanceof Error && e.message.length > 0) return e.message;
  return fallback;
}

export function printThermal(): void {
  const receiptEl = document.querySelector<HTMLElement>('.print-receipt');
  if (!receiptEl) { window.print(); return; }

  const clone = receiptEl.cloneNode(true) as HTMLElement;
  clone.className = 'print-receipt';
  clone.style.cssText = '';

  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="UTF-8">
<style>${RECEIPT_PRINT_CSS}</style>
</head><body>${clone.outerHTML}</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:0;width:80mm;height:1px;border:0;visibility:hidden;';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    window.addEventListener('afterprint', () => iframe.remove(), { once: true });
    setTimeout(() => { if (document.body.contains(iframe)) iframe.remove(); }, 5000);
  }, 250);
}
