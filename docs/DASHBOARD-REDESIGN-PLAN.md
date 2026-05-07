# Dashboard Redesign Plan — PMS Pharmacy v4

> **Goal:** Transform the current scroll-heavy, empty-state-heavy dashboard into a focused, actionable command center that surfaces what matters and hides what doesn't.

---

## Current Problems (from Screenshot Analysis)

| Issue | Impact |
|-------|--------|
| **5 empty states visible** | Looks broken/unprofessional |
| **Raw symbols ($, #, i)** | No localization, confusing |
| **Tiny trend chart** | Unreadable, wastes space |
| **Alert banner + low stock card** | Competing for attention |
| **No visual hierarchy** | Everything same visual weight |
| **"No data" messages** | Negative space without CTAs |
| **Scrolling required** | KPIs not immediately visible |

---

## Proposed Layout: "Above the Fold" Principle

```
┌─────────────────────────────────────────────────────────────┐
│  ROW 1: KPI Cards (never scroll)                            │
│  ┌──────────┬──────────┬──────────┬──────────┐             │
│  │ 💰 Sales │ 📈 Profit│ 🛒 Orders│ ⚠️ Low    │             │
│  │  Today   │  Today   │  Today   │  Stock    │             │
│  │ 12,450   │ 3,200    │   24     │  5 items  │             │
│  └──────────┴──────────┴──────────┴──────────┘             │
├─────────────────────────────────────────────────────────────┤
│  ROW 2: Smart Alerts (conditional, collapsible)              │
│  [🟡 5 items low stock] [🔴 2 batches expired]             │
├─────────────────────────────────────────────────────────────┤
│  ROW 3: Main Content                                         │
│  ┌──────────────────────────────┬──────────────┐            │
│  │                              │              │            │
│  │   7-Day Sales Chart          │ Quick Actions│            │
│  │   (bigger, readable)         │ ┌──────────┐ │            │
│  │                              │ │+ New Sale│ │            │
│  │                              │ │+ Purchase│ │            │
│  │                              │ │ View Low │ │            │
│  │                              │ └──────────┘ │            │
│  └──────────────────────────────┴──────────────┘            │
├─────────────────────────────────────────────────────────────┤
│  ROW 4: Recent Activity (last 5 transactions)               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ #2345  Paracetamol  2,500 SDG  Cash  10:42 AM      ✓  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Detailed Component Changes

### 1. KPI Cards (Top Row)

**Current:** Mixed small cards, some empty
**New:** 4 unified cards with Lucide icons

| Card | Icon | Value | Trend |
|------|------|-------|-------|
| مبيعات اليوم | `TrendingUp` | `formatMoney(todaySales)` | vs yesterday |
| الربح | `Coins` | `formatMoney(todayProfit)` | margin % |
| الطلبات | `ShoppingCart` | `todayOrders` count | — |
| منخفض المخزون | `AlertTriangle` | `lowStockCount` | red if >0 |

**CSS:** `grid grid-cols-4 gap-4` on desktop, `grid-cols-2` on tablet

---

### 2. Smart Alerts Banner

**Current:** Yellow permanent banner + separate low-stock card
**New:** Conditional chips that appear only when needed

```tsx
{activeAlerts.length > 0 && (
  <div className="flex gap-2 mb-4">
    {activeAlerts.map(alert => (
      <button 
        key={alert.type}
        onClick={alert.action}
        className={`rounded-full px-3 py-1.5 text-sm font-medium ${
          alert.severity === 'critical' ? 'bg-red-100 text-red-700' :
          alert.severity === 'warning' ? 'bg-amber-100 text-amber-700' :
          'bg-blue-100 text-blue-700'
        }`}
      >
        {alert.icon} {alert.message}
      </button>
    ))}
  </div>
)}
```

**Alert types:**
- `low_stock` → Navigate to low stock report
- `expiring` → Navigate to expiring batches
- `expired` → Navigate to expired (critical)
- `overdue_payments` → Navigate to payables

---

### 3. 7-Day Sales Chart

**Current:** Tiny line chart at bottom
**New:** Prominent 300px height chart with proper grid

**Changes:**
- Move to **Row 3, left side** (2/3 width)
- Height: `h-[300px]` minimum
- Show grid lines
- Y-axis labels every 2,500 SDG
- X-axis: day names (السبت → الجمعة)
- Tooltip on hover with exact value

**Empty state:** If no sales this week, show:
```
┌─────────────────────────────┐
│      📊                     │
│   لا توجد مبيعات هذا الأسبوع │
│                             │
│   [ابدأ أول عملية بيع]      │
└─────────────────────────────┘
```

---

### 4. Quick Actions Panel

**New component** — replaces empty "آخر المبيعات" table

| Button | Action | Icon |
|--------|--------|------|
| عملية بيع جديدة | Navigate to POS | `Banknote` |
| فاتورة مشتريات | Navigate to Purchases | `Truck` |
| المخزون المنخفض | Navigate to Low Stock | `AlertTriangle` |
| المنتجات منتهية الصلاحية | Navigate to Expired | `CalendarX` |

**CSS:** `flex flex-col gap-2` inside a card

---

### 5. Recent Transactions List

**Current:** Empty table with `$` symbol
**New:** Slim list of last 5 sales (only if exists)

```tsx
{recentSales.length > 0 ? (
  <div className="space-y-2">
    {recentSales.slice(0, 5).map(sale => (
      <div key={sale.id} className="flex items-center justify-between p-3 rounded-xl bg-white border">
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-muted">#{sale.number}</span>
          <span className="font-medium">{sale.customer || 'زائر'}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="tabular-nums font-semibold">{formatMoney(sale.total)}</span>
          <span className="text-xs px-2 py-1 rounded-full bg-green-50 text-green-700">{sale.paymentMethod}</span>
          <span className="text-xs text-ink-muted">{formatTime(sale.time)}</span>
        </div>
      </div>
    ))}
  </div>
) : (
  <EmptyState 
    icon={ShoppingCart}
    title="لا توجد مبيعات اليوم"
    action={{ label: "بدء عملية البيع", to: "/pos" }}
  />
)}
```

---

### 6. Remove/Replace These Components

| Current | Action | Replacement |
|---------|--------|-------------|
| "آخر المبيعات" empty table with `$` | ❌ Remove | Quick Actions panel |
| "أكثر المنتجات مبيعاً" with `#` | ❌ Remove | Conditional: show only if >0 sales |
| "آخر النشاطات" with `i` | ❌ Remove | System log moved to Settings page |
| Permanent yellow alert banner | ❌ Remove | Smart Alerts (conditional) |
| Tiny trend chart | ♻️ Replace | Big chart in Row 3 |
| Collection rate mini-cards | ♻️ Consolidate | Into KPI cards row |

---

## Technical Implementation Plan

### Phase A: Layout Structure (30 min)
1. Add CSS Grid wrapper to Dashboard.tsx
2. Create `KPICard` component (reusable)
3. Create `SmartAlerts` component

### Phase B: Data Integration (30 min)
1. Add API endpoint: `get_dashboard_summary()` → Rust
2. Returns: `{ today_sales, today_profit, today_orders, low_stock_count, alerts[] }`
3. Wire to frontend

### Phase C: Polish (30 min)
1. Empty states with CTAs
2. Chart styling improvements
3. RTL testing

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Dashboard.tsx` | Complete layout rewrite |
| `src/components/dashboard/KPICard.tsx` | New component |
| `src/components/dashboard/SmartAlerts.tsx` | New component |
| `src/components/dashboard/QuickActions.tsx` | New component |
| `src-tauri/src/commands/dashboard.rs` | New: `get_dashboard_summary` |
| `src-tauri/src/lib.rs` | Register command |
| `src/api/dashboard.ts` | New API functions |
| `src/i18n/ar.json` + `en.json` | Dashboard keys |

---

## Acceptance Criteria

- [ ] All 4 KPI cards visible without scrolling (1080p)
- [ ] No empty placeholder cards visible
- [ ] Alerts only appear when actionable
- [ ] Chart readable with grid lines
- [ ] Quick actions accessible in 1 click
- [ ] RTL layout correct
- [ ] Mobile: vertical stack, cards still visible without scroll

---

## Next Step

**Decision needed:** 
1. **Quick fix** — I can implement this now (90 min)
2. **Defer** — Move to Phase 2 after cloud sync verification

Recommend: **Implement now** — dashboard is first impression for users.
