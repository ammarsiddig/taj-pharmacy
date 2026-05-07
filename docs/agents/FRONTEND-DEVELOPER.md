# Frontend Developer — TAJ Pharmacy v4

> **Role**: React/TypeScript UI layer, state management, i18n, Tauri bridge.
> **You OWN**: All files in `src/` except `src/lib/tauri.ts` (shared with Rust).
> **You TOUCH**: `src/types/` (TypeScript type definitions), `src/i18n/` (translation files).
> **You NEVER**: Modify Rust code (`src-tauri/`) or cloud code (`pms-cloud/`). If a Rust command is missing or broken, file a cross-role request to Rust Developer.

---

## Session Protocol

1. Read this file + `_ACTIVE-LOCK.md` + last 3 entries in `_WORK-LOG.md`
2. Read `docs/AGENT-HANDOFF.md` sections 1–6 for project context
3. Do your work
4. Run `npx tsc --noEmit` after every change. Run `npm run build` before finishing.
5. Update this file (flip ⬜→✅, update module map)
6. Append to `_WORK-LOG.md`
7. Update `_ACTIVE-LOCK.md` (clear session, update queue)

---

## Architecture

### Layered Design (STRICT)

```
src/
  api/          # SOLE layer that calls invoke() — every Tauri call goes through here
  types/        # Shared TypeScript interfaces — mirror Rust structs exactly
  pages/        # Route-level components — one per sidebar entry
  components/   # Reusable UI components — ui/, layout/, products/
  hooks/        # Custom React hooks — useAuth, usePermission, useAuditLog, etc.
  i18n/         # Internationalization — ar.json (primary), en.json
  utils/        # Pure utility functions — csv.ts, productImport.ts
  lib/          # Tauri bridge — tauri.ts (invoke wrapper)
```

### Data Flow (STRICT)

```
User Action → Page Component → api/*.ts → invoke() → Rust Command → SQLite
                                    ↓
                              TypeScript types mirror Rust structs
```

**NEVER** call `invoke()` directly from a page or component. Always go through `src/api/`.

### API Layer Pattern

Every API function follows this pattern:

```typescript
// src/api/products.ts
import { invoke } from '../lib/tauri';
import type { Product } from '../types';
import { getTenantId, getBranchId } from './core';

export async function getProducts(): Promise<Product[]> {
  return invoke('get_products', {
    tenantId: getTenantId(),
    branchId: getBranchId(),
  });
}
```

### Component Pattern

```typescript
// 1. Named export only (no default exports for components)
// 2. Props interface defined above the component
// 3. Hooks at the top
// 4. Event handlers after hooks
// 5. Render at the bottom

interface CartItemProps {
  item: CartItem;
  onUpdateQty: (batchId: string, delta: number) => void;
  onRemove: (batchId: string) => void;
}

export function CartItem({ item, onUpdateQty, onRemove }: CartItemProps) {
  const { t } = useTranslation();
  // ...
}
```

---

## Conventions

| Convention | Rule |
|-----------|------|
| **Money display** | Always use `api.formatMoney(piasters)` — never divide by 100 inline |
| **Money input** | User types in decimal, convert to integer piasters on submit: `Math.round(parseFloat(val) * 100)` |
| **RTL-first** | Use `ms-*/me-*/ps-*/pe-*` logical properties. NEVER `ml-*/mr-*/pl-*/pr-*` |
| **i18n** | All user-facing strings use `t('key')`. Keys in both `ar.json` and `en.json` simultaneously |
| **i18n keys** | Dot-notation: `pos.sale_complete`, `products.low_stock`. Never camelCase keys |
| **No `any`** | TypeScript `any` is forbidden. Use `unknown` + type guard if type is truly unknown |
| **Named exports** | Components use named exports. Pages use `export default` for React.lazy |
| **Error handling** | `try/catch` around every `api.*` call. Show `toast.error(t('key'))` on failure |
| **Loading states** | Every data fetch has a loading state. Show skeleton or spinner, never blank |
| **Permission checks** | `usePermission('feature_name')` to show/hide UI elements. Backend enforces too |
| **Auth** | `useAuth()` hook for user info, role, permissions |
| **Max file** | 400 lines (target). 800 lines (hard limit). |
| **Max function** | 50 lines |
| **Max component** | 200 lines. Extract sub-components if larger |
| **Tailwind only** | No custom CSS files. Use Tailwind v4 utility classes only |
| **Color tokens** | Use `ink-main`, `ink-muted`, `ivory-app`, `ivory-border`, `brand-500` etc. — never raw hex |

---

## Current Module Map

### Pages (`src/pages/`)

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `POS.tsx` | ~1209 | 🔴 OVER LIMIT | 30+ useState, needs useReducer + split |
| `Products.tsx` | ~600 | 🟡 | Could benefit from sub-components |
| `Purchases.tsx` | ~500 | 🟢 | |
| `Sales.tsx` | ~400 | 🟢 | |
| `Reports.tsx` | ~500 | 🟡 | Multiple report types in one file |
| `Warehouse.tsx` | ~400 | 🟢 | |
| `Dashboard.tsx` | ~300 | 🟢 | |
| `Accounts.tsx` | ~400 | 🟢 | |
| `Expenses.tsx` | ~350 | 🟢 | |
| `Settings.tsx` | ~100 | 🟢 | Tab container only |
| `CustomerDetail.tsx` | ~300 | 🟢 | |
| `SupplierDetail.tsx` | ~300 | 🟢 | |
| `PurchaseDetail.tsx` | ~400 | 🟢 | |
| `PurchaseNew.tsx` | ~400 | 🟢 | |
| `Login.tsx` | ~200 | 🟢 | |
| `Onboarding.tsx` | ~200 | 🟢 | |
| `Assets.tsx` | ~200 | 🟢 | |

### POS Sub-components (`src/pages/pos/`)

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `CartWorkspaceBar.tsx` | ~80 | 🟢 | |
| `OpenSessionModal.tsx` | ~100 | 🟢 | |
| `CloseSessionModal.tsx` | ~120 | 🟢 | |
| `ReturnModal.tsx` | ~200 | 🟢 | |
| `SessionHistoryPanel.tsx` | ~150 | 🟢 | |
| `ReceiptCustomizerModal.tsx` | ~120 | 🟢 | |
| `workspaceState.ts` | ~193 | 🟢 | Workspace state management |

### Settings Tabs (`src/pages/settings/`)

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `GeneralTab.tsx` | ~200 | 🟢 | |
| `UserPanel.tsx` | ~300 | 🟢 | |
| `RolesTab.tsx` | ~250 | 🟢 | |
| `BackupTab.tsx` | ~200 | 🟢 | |
| `CloudSyncTab.tsx` | ~200 | 🟢 | |
| `LicenseTab.tsx` | ~200 | 🟢 | |
| `BranchesTab.tsx` | ~200 | 🟢 | |
| `AuditTab.tsx` | ~200 | 🟢 | |
| `PaymentSettingsTab.tsx` | ~200 | 🟢 | |
| `PharmacyManagementTab.tsx` | ~200 | 🟢 | |
| `NotificationsTab.tsx` | ~150 | 🟢 | |
| `UnitManagementTab.tsx` | ~150 | 🟢 | |

### API Layer (`src/api/`)

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `core.ts` | ~143 | 🟢 | Auth state, formatMoney, tenant/branch IDs, print CSS |
| `pos.ts` | ~234 | 🟡 | Includes purchase API calls (should be in purchases.ts) |
| `products.ts` | ~150 | 🟢 | |
| `expenses.ts` | ~80 | 🟢 | |
| `customers.ts` | ~80 | 🟢 | |
| `suppliers.ts` | ~80 | 🟢 | |
| `accounts.ts` | ~80 | 🟢 | |
| `reports.ts` | ~80 | 🟢 | |
| `warehouse.ts` | ~80 | 🟢 | |
| `notifications.ts` | ~60 | 🟢 | |
| `settings.ts` | ~100 | 🟢 | |
| `system.ts` | ~60 | 🟢 | |
| `index.ts` | ~12 | 🟢 | Re-exports all |

### Components (`src/components/`)

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `ui/Button.tsx` | ~40 | 🟢 | |
| `ui/Input.tsx` | ~40 | 🟢 | |
| `ui/Modal.tsx` | ~60 | 🟢 | |
| `ui/Select.tsx` | ~50 | 🟢 | |
| `ui/Table.tsx` | ~50 | 🟢 | |
| `ui/Badge.tsx` | ~30 | 🟢 | |
| `ui/Toast.tsx` | ~80 | 🟢 | |
| `ui/Numpad.tsx` | ~60 | 🟢 | |
| `ui/NumericInput.tsx` | ~40 | 🟢 | |
| `ui/PrintReceipt.tsx` | ~200 | 🟡 | |
| `ui/PrintInvoice.tsx` | ~200 | 🟡 | |
| `ui/ReadOnlyBanner.tsx` | ~30 | 🟢 | |
| `ui/AnnouncementBanner.tsx` | ~40 | 🟢 | |
| `layout/AppLayout.tsx` | ~100 | 🟢 | |
| `layout/Sidebar.tsx` | ~150 | 🟢 | |
| `layout/TopBar.tsx` | ~80 | 🟢 | |
| `layout/StatusBar.tsx` | ~60 | 🟢 | |
| `products/ProductImportModal.tsx` | ~200 | 🟢 | |
| `products/UnitManagementModal.tsx` | ~150 | 🟢 | |
| `CustomersTab.tsx` | ~200 | 🟢 | |
| `SuppliersTab.tsx` | ~200 | 🟢 | |
| `PharmacySwitcher.tsx` | ~80 | 🟢 | |

### Hooks (`src/hooks/`)

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `useAuth.tsx` | ~57 | 🟢 | Context + provider |
| `usePermission.ts` | ~30 | 🟢 | Permission check hook |
| `useAuditLog.ts` | ~40 | 🟢 | |
| `useAppMode.tsx` | ~50 | 🟢 | |
| `useLicense.tsx` | ~60 | 🟢 | |

### Types (`src/types/`)

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `pos.ts` | ~366 | 🟡 | Includes purchase types (should split) |
| `products.ts` | ~150 | 🟢 | |
| `auth.ts` | ~50 | 🟢 | |
| `customers.ts` | ~50 | 🟢 | |
| `suppliers.ts` | ~50 | 🟢 | |
| `expenses.ts` | ~50 | 🟢 | |
| `accounts.ts` | ~50 | 🟢 | |
| `reports.ts` | ~50 | 🟢 | |
| `settings.ts` | ~80 | 🟢 | |
| `warehouse.ts` | ~50 | 🟢 | |
| `notifications.ts` | ~30 | 🟢 | |
| `system.ts` | ~30 | 🟢 | |
| `index.ts` | ~30 | 🟢 | Re-exports all |

### i18n (`src/i18n/`)

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `ar.json` | ~800+ | 🟡 | Primary language — must be complete |
| `en.json` | ~800+ | 🟡 | Often lags behind ar.json |
| `index.ts` | ~22 | 🟢 | i18next config, default 'ar' |

---

## Known Issues

| # | Issue | Severity | File(s) | Notes |
|---|-------|----------|---------|-------|
| 1 | POS.tsx has 30+ useState hooks | 🔴 Critical | `POS.tsx` | Unmanageable state, race conditions likely. Needs useReducer refactor |
| 2 | POS.tsx is 1209 lines | 🔴 Critical | `POS.tsx` | Exceeds 800-line hard limit by 50% |
| 3 | Purchase types in pos.ts | 🟡 Medium | `types/pos.ts`, `api/pos.ts` | PurchaseInvoice types and API calls live in pos module — confusing |
| 4 | No error boundaries | 🟡 Medium | App-wide | Unhandled errors crash entire app |
| 5 | No React.memo on heavy lists | 🟡 Medium | `POS.tsx`, `Products.tsx` | Cart items and product lists re-render unnecessarily |
| 6 | en.json often incomplete | 🟡 Medium | `i18n/en.json` | New keys added to ar.json but not en.json |
| 7 | No standardized loading pattern | 🟡 Medium | App-wide | Some pages use spinner, some show nothing, some flash empty state |
| 8 | Hardcoded tenant/branch IDs | 🟡 Medium | `api/core.ts` | `DEFAULT_TENANT_ID = 'default-tenant'` — Phase 3 will fix |
| 9 | No form validation library | 🟢 Low | App-wide | All validation is manual if/else — inconsistent UX |
| 10 | Print CSS in core.ts | 🟢 Low | `api/core.ts` | RECEIPT_PRINT_CSS template lives in API layer — should be in components |

---

## Planned Refactors

### 1. POS.tsx useReducer Split (P0 — Highest Priority)

**Current**: 30+ useState hooks in a single 1209-line component.
**Target**: useReducer with typed actions, sub-components under 200 lines each.

```
POS.tsx (main orchestrator, ~200 lines)
├── posReducer.ts          — Action types + reducer function
├── PosSearchPanel.tsx     — Product search + results
├── PosCartPanel.tsx       — Cart table + qty controls
├── PosPaymentPanel.tsx    — Payment method + amount + customer
├── PosSessionBar.tsx      — Session status + open/close buttons
└── (existing pos/ sub-components remain)
```

**Reducer actions** (draft):
- `SET_CART`, `ADD_TO_CART`, `UPDATE_QTY`, `REMOVE_FROM_CART`
- `SET_PAYMENT_METHOD`, `SET_AMOUNT_PAID`, `SET_CUSTOMER`
- `SET_DISCOUNT`, `SET_NOTE`
- `START_SALE`, `SALE_SUCCESS`, `SALE_FAILURE`
- `OPEN_SESSION`, `CLOSE_SESSION`
- `SWITCH_WORKSPACE`, `PARK_WORKSPACE`, `RESTORE_WORKSPACE`

### 2. Purchase Types/API Split (P1)

Move from `types/pos.ts` + `api/pos.ts`:
- `PurchaseInvoiceRow`, `PurchaseInvoiceDetail`, `PurchaseInvoiceCreateData`
- `PaymentSchedule`, `PaymentScheduleData`, `SchedulePaymentData`
- `ConfirmPurchasePaymentData`, `CreatePurchaseReturnData`

To new files:
- `types/purchases.ts`
- `api/purchases.ts`

### 3. Error Boundaries (P1)

Add React error boundaries at:
- App root (catch-all, shows recovery UI)
- POS page (most complex, most likely to crash)
- Settings page (less critical)

### 4. Standardized Loading Pattern (P2)

Create a `useAsyncData<T>()` hook:
```typescript
function useAsyncData<T>(fetcher: () => Promise<T>): {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}
```

---

## Active Tasks

| # | Task | Priority | Status | Blockers | Notes |
|---|------|----------|--------|----------|-------|
| 1 | POS.tsx useReducer refactor | P0 | ⬜ | None | Break into reducer + 4 sub-components |
| 2 | Extract purchase types/API to own module | P1 | ⬜ | None | Move from pos.ts to purchases.ts |
| 3 | Add React error boundaries | P1 | ⬜ | None | App root + POS + Settings |
| 4 | Audit en.json completeness | P1 | ⬜ | None | Compare keys with ar.json |
| 5 | Add React.memo to cart items and product lists | P2 | ⬜ | None | Performance optimization |
| 6 | Create useAsyncData hook | P2 | ⬜ | None | Standardize loading/error pattern |
| 7 | Move print CSS out of core.ts | P2 | ⬜ | None | Into PrintReceipt/PrintInvoice components |
| 8 | Add form validation helpers | P3 | ⬜ | None | Consider zod or lightweight custom |

---

## Completed Tasks

| # | Task | Date | Notes |
|---|------|------|-------|
| 1 | POS workspace state persistence | 2026-05 | workspaceState.ts with normalize functions |
| 2 | Cart workspace bar component | 2026-05 | CartWorkspaceBar.tsx |
| 3 | Receipt customizer modal | 2026-05 | ReceiptCustomizerModal.tsx |
| 4 | Full i18n audit | 2026-05 | All hardcoded strings replaced with t() keys |

---

## Cross-Role Requests

### To Rust Developer

| # | Request | Priority | Status | Notes |
|---|---------|----------|--------|-------|
| 1 | Add `get_purchase_summary` command | P2 | ⬜ | Reports page needs purchase stats |
| 2 | Return structured error types instead of String | P0 | ⬜ | Frontend can't differentiate error types for UX |

### To UI/UX Designer

| # | Request | Priority | Status | Notes |
|---|---------|----------|--------|-------|
| 1 | POS payment panel redesign | P1 | ⬜ | Current layout is cramped on small screens |
| 2 | Standardized empty state designs | P2 | ⬜ | Each page has different empty state style |
| 3 | Loading skeleton designs | P2 | ⬜ | Need consistent skeleton patterns |

### To QA Engineer

| # | Request | Priority | Status | Notes |
|---|---------|----------|--------|-------|
| 1 | Test POS cart edge cases | P0 | ⬜ | Zero qty, negative qty, max qty, decimal qty |
| 2 | Test RTL layout on all pages | P1 | ⬜ | Some pages may have LTR artifacts |

---

## i18n Process

### Adding a New Translation Key

1. Add key to **both** `src/i18n/ar.json` AND `src/i18n/en.json` simultaneously
2. Use dot-notation: `"pos.sale_complete"` not `"posSaleComplete"`
3. Arabic is the primary language — Arabic text is the source of truth
4. English translations should be natural, not literal
5. Group keys by page/feature: `pos.*`, `products.*`, `settings.*`, `common.*`

### Key Naming Convention

```
page.feature.action = "القيمة"
pos.cart.add = "إضافة للسلة"
pos.payment.cash = "نقدي"
pos.payment.bank = "بنكي"
common.save = "حفظ"
common.cancel = "إلغاء"
common.delete = "حذف"
common.confirm = "تأكيد"
```

### Never Do

- ❌ Hardcode Arabic/English strings in components
- ❌ Add keys to only one language file
- ❌ Use key names that are English sentences: `"pos.theSaleWasCompletedSuccessfully"`
- ❌ Nest objects in JSON — keep flat dot-notation keys
