# UI/UX Designer — TAJ Pharmacy v4

> **Role**: Visual design, interaction patterns, accessibility, RTL compliance, user experience.
> **You OWN**: Design decisions, component specifications, layout rules documented in this file.
> **You TOUCH**: `src/index.css` (design tokens), `src/components/ui/` (base components).
> **You NEVER**: Write business logic, API calls, or Rust code. You specify HOW things look and behave; Frontend Developer implements.

---

## Session Protocol

1. Read this file + `_ACTIVE-LOCK.md` + last 3 entries in `_WORK-LOG.md`
2. Read `docs/AGENT-HANDOFF.md` sections 1–6 for project context
3. Do your work (design specs, component audits, accessibility reviews)
4. Update this file (flip ⬜→✅, update design system status)
5. Append to `_WORK-LOG.md`
6. Update `_ACTIVE-LOCK.md` (clear session, update queue)

---

## Design System — TAJ Pharmacy

### Color Tokens (Defined in `src/index.css`)

| Token | Value | Usage |
|-------|-------|-------|
| `ivory-app` | `#F4FBFB` | Page background |
| `ivory-surface` | `#FFFFFF` | Card/panel background |
| `ivory-muted` | `#F4FBFB` | Muted surface background |
| `ivory-border` | `#D3E8E9` | Borders, dividers |
| `surface-secondary` | `#EAF6F6` | Secondary surface, hover states |

**Primary (Action) — `#0FA3A6`**
| Token | Value | Usage |
|-------|-------|-------|
| `primary-50` | `#EFFAFA` | Lightest background |
| `primary-100` | `#CDECED` | Light background |
| `primary-200` | `#A3DCDD` | — |
| `primary-300` | `#72C8CA` | — |
| `primary-400` | `#40B5B7` | — |
| `primary-500` | `#0FA3A6` | **Main action color** — buttons, CTAs, active states |
| `primary-600` | `#0D8B8D` | Hover state |
| `primary-700` | `#0A7073` | Active/pressed state |
| `primary-800` | `#075355` | — |
| `primary-900` | `#043A3B` | — |

**Brand (Navigation) — `#1C5F6F`**
| Token | Value | Usage |
|-------|-------|-------|
| `brand-50` | `#EAF5F7` | — |
| `brand-100` | `#C4E3EB` | — |
| `brand-200` | `#96CDD8` | — |
| `brand-300` | `#60B3C4` | — |
| `brand-400` | `#3A99B1` | — |
| `brand-500` | `#2E7F95` | — |
| `brand-600` | `#1C5F6F` | **Sidebar, structural UI** |
| `brand-700` | `#164E5B` | — |
| `brand-800` | `#103D47` | — |
| `brand-900` | `#0A2B32` | — |

**Ink (Text)**
| Token | Value | Usage |
|-------|-------|-------|
| `ink-main` | `#0D2023` | Primary text |
| `ink-muted` | `#3D6567` | Secondary text, labels |
| `ink-placeholder` | `#7AADB0` | Placeholder text |

**Status**
| Token | Value | Usage |
|-------|-------|-------|
| `status-danger` | `#DC2626` | Error, delete, critical |
| `status-danger-bg` | `#FEF2F2` | Error background |
| `status-warning` | `#D97706` | Warning, caution |
| `status-warning-bg` | `#FFFBEB` | Warning background |
| `status-success` | `#059669` | Success, confirmed |
| `status-success-bg` | `#F0FDF4` | Success background |

### Typography

| Element | Font | Weight | Size |
|---------|------|--------|------|
| Body | Tajawal | 400 | 14px (text-sm) |
| Headings | Tajawal | 700 | varies |
| Buttons | Tajawal | 600 | 14px |
| Tabular numbers | Tajawal | 500 | use `tabular-nums` class |
| Monospace | Courier New | 400 | Receipts only |

### Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `shadow-soft` | `0 4px 6px -1px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.06)` | Subtle elevation |
| `shadow-card` | `0 10px 25px -16px rgb(15 23 42 / 0.22), 0 4px 10px -6px rgb(15 23 42 / 0.08)` | Cards |
| `shadow-float` | `0 20px 45px -24px rgb(15 23 42 / 0.28), 0 12px 20px -16px rgb(15 23 42 / 0.14)` | Modals, dropdowns |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | `10px` | Small elements, badges |
| `radius-md` | `12px` | Buttons, inputs |
| `radius-lg` | `12px` | Cards |
| `radius-2xl` | `16px` | Modals |
| `radius-3xl` | `18px` | Large containers |
| `radius-full` | `999px` | Pills, avatars |

### Spacing Scale

Standard Tailwind v4 spacing. Key values:
- `gap-2` = 8px (tight)
- `gap-3` = 12px (default)
- `gap-4` = 16px (comfortable)
- `gap-6` = 24px (section)
- `gap-8` = 32px (page section)

---

## Layout Rules

### App Shell

```
┌──────────────────────────────────────────────────┐
│ Sidebar (256px / 78px collapsed)  │  TopBar      │
│                                   │──────────────│
│  brand-600 background             │  Content     │
│  white text                       │  ivory-app   │
│  nav items in 3 groups            │  background  │
│                                   │              │
│  ─── core ───                     │              │
│  Dashboard, POS                   │              │
│                                   │              │
│  ─── ops ───                      │              │
│  Sales, Purchases, Products,      │              │
│  Warehouse, Expenses              │              │
│                                   │              │
│  ─── admin ───                    │              │
│  Reports, Settings                │              │
│                                   │              │
│  StatusBar (bottom)               │              │
└──────────────────────────────────────────────────┘
```

### Page Layout Pattern

```
┌─────────────────────────────────────┐
│ Page Title + Action Button          │
│ text-xl font-bold text-ink-main     │
├─────────────────────────────────────┤
│ Filters / Search Bar               │
│ bg-ivory-surface rounded-2xl p-4   │
├─────────────────────────────────────┤
│ Content Area                        │
│ bg-ivory-surface rounded-2xl p-4   │
│                                     │
│ Table / Cards / Form               │
│                                     │
└─────────────────────────────────────┘
```

### Card Pattern

```
bg-ivory-surface rounded-2xl p-4 shadow-soft
```

### Modal Pattern

```
bg-ivory-surface rounded-2xl shadow-float max-w-lg w-full
```

---

## Component Specifications

### Button (`src/components/ui/Button.tsx`)

| Variant | Classes | Usage |
|---------|---------|-------|
| Primary | `bg-primary-500 text-white hover:bg-primary-600` | Main CTA |
| Secondary | `bg-ivory-app text-ink-main hover:bg-ivory-border` | Alternative action |
| Danger | `bg-status-danger text-white hover:bg-red-700` | Delete, void |
| Ghost | `text-ink-muted hover:text-ink-main hover:bg-ivory-app` | Tertiary |
| Size sm | `px-3 py-1.5 text-xs rounded-xl` | Inline, table actions |
| Size md | `px-4 py-2 text-sm rounded-xl` | Default |
| Size lg | `px-6 py-2.5 text-sm rounded-xl` | Page CTA |

### Input (`src/components/ui/Input.tsx`)

```
w-full rounded-xl border border-ivory-border bg-ivory-surface
px-3 py-2 text-sm text-ink-main
placeholder:text-ink-placeholder
focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500
```

### Modal (`src/components/ui/Modal.tsx`)

- Overlay: `bg-black/40 backdrop-blur-sm`
- Container: `bg-ivory-surface rounded-2xl shadow-float max-w-lg w-full mx-4`
- Header: `px-6 py-4 border-b border-ivory-border`
- Body: `px-6 py-4`
- Footer: `px-6 py-4 border-t border-ivory-border flex gap-3 justify-end`

### Table (`src/components/ui/Table.tsx`)

- Header: `bg-ivory-app text-ink-muted text-xs font-medium`
- Row: `border-b border-ivory-border hover:bg-ivory-app/50`
- Cell: `px-4 py-3 text-sm`

### Badge (`src/components/ui/Badge.tsx`)

| Variant | Classes | Usage |
|---------|---------|-------|
| Success | `bg-status-success-bg text-status-success` | Confirmed, active |
| Warning | `bg-status-warning-bg text-status-warning` | Pending, draft |
| Danger | `bg-status-danger-bg text-status-danger` | Cancelled, expired |
| Neutral | `bg-ivory-app text-ink-muted` | Default |

### Toast (`src/components/ui/Toast.tsx`)

- Position: bottom-end
- Success: green accent
- Error: red accent
- Auto-dismiss: 4 seconds

---

## RTL Rules (CRITICAL)

This is an **Arabic-first** application. RTL is the default direction.

### CSS Logical Properties (MANDATORY)

| ❌ Never Use | ✅ Always Use | Purpose |
|-------------|--------------|---------|
| `ml-*` / `mr-*` | `ms-*` / `me-*` | Margin start/end |
| `pl-*` / `pr-*` | `ps-*` / `pe-*` | Padding start/end |
| `left-*` / `right-*` | `start-*` / `end-*` | Positioning |
| `text-left` / `text-right` | `text-start` / `text-end` | Text alignment |
| `border-l-*` / `border-r-*` | `border-s-*` / `border-e-*` | Border sides |
| `rounded-l-*` / `rounded-r-*` | `rounded-s-*` / `rounded-e-*` | Border radius |

### RTL Checklist for Every Component

- [ ] Layout flows start-to-end (not left-to-right)
- [ ] Icons that indicate direction are mirrored (arrows, chevrons)
- [ ] Text alignment uses `text-start` not `text-right`
- [ ] Padding/margin uses `ps/pe/ms/me` not `pl/pr/ml/mr`
- [ ] Number inputs display numbers LTR within RTL context
- [ ] Tables have consistent column order in both directions

### Bilingual Support

- **Arabic** (primary): `ar.json` — source of truth
- **English** (secondary): `en.json` — must stay in sync
- Default language: Arabic (`dir="rtl"`, `lang="ar"`)
- Language switch: Updates `document.documentElement.lang` and `dir`
- Font: Tajawal supports both Arabic and Latin scripts

---

## Interaction Patterns

### POS — Primary Workflow

```
Search Product → Add to Cart → Set Qty → Choose Payment → Complete Sale → Print Receipt
```

**Keyboard shortcuts** (defined in POS.tsx):
- `F2` — Focus search
- `F4` — Quick cash sale
- `F8` — Park cart
- `F9` — Void last sale
- `Escape` — Clear search / close modal

### List → Detail Pattern

All list pages follow:
1. List view with search + filters
2. Click row → navigate to detail page
3. Detail page has back button + action buttons

### Form Pattern

1. Fields stacked vertically
2. Required fields marked with `*` in label
3. Validation on blur + on submit
4. Error message below field in `text-status-danger text-xs`
5. Submit button disabled until valid

### Confirmation Pattern

Destructive actions (delete, void, cancel) require:
1. Modal with clear warning text
2. Button labeled with action: "حذف" / "إلغاء الفاتورة"
3. Danger-colored confirm button
4. Ghost-colored cancel button

---

## Known Design Issues

| # | Issue | Severity | Page(s) | Notes |
|---|-------|----------|---------|-------|
| 1 | POS payment panel cramped on small screens | 🔴 High | POS | Need responsive layout for 1024px height |
| 2 | Inconsistent empty states across pages | 🟡 Medium | All | Some show text, some show icon, some show nothing |
| 3 | No loading skeleton pattern | 🟡 Medium | All | Spinner vs blank vs shimmer — inconsistent |
| 4 | Sidebar text truncated when collapsed | 🟡 Medium | Sidebar | Tooltip needed for collapsed state |
| 5 | Print receipt layout not tested on 58mm printers | 🟡 Medium | POS | Only 80mm tested |
| 6 | No dark mode | 🟢 Low | All | Not requested but common expectation |
| 7 | Status badges inconsistent sizing | 🟢 Low | Various | Some use px-2 py-0.5, others px-3 py-1 |
| 8 | Focus ring not visible on some elements | 🟡 Medium | All | Accessibility issue |

---

## Active Tasks

| # | Task | Priority | Status | Blockers | Notes |
|---|------|----------|--------|----------|-------|
| 1 | Design POS payment panel responsive layout | P0 | ⬜ | None | Must work on 1024×768 screens |
| 2 | Create standardized empty state components | P1 | ⬜ | None | Icon + text + optional CTA |
| 3 | Create loading skeleton components | P1 | ⬜ | None | Table skeleton, card skeleton, detail skeleton |
| 4 | Audit all pages for RTL compliance | P1 | ⬜ | None | Check every ml/mr/pl/pr usage |
| 5 | Design sidebar tooltip for collapsed state | P2 | ⬜ | None | Show nav item name on hover |
| 6 | Standardize badge sizing | P2 | ⬜ | None | One size for all badges |
| 7 | Test receipt on 58mm printer | P2 | ⬜ | None | Need physical printer or emulator |
| 8 | Fix focus ring visibility | P1 | ⬜ | None | Accessibility requirement |
| 9 | Design error boundary recovery UI | P1 | ⬜ | None | App-level + page-level |

---

## Completed Tasks

| # | Task | Date | Notes |
|---|------|------|-------|
| 1 | TAJ color system implementation | 2026-05-05 | Primary + Brand + Ink + Status tokens |
| 2 | App rename to TAJ Pharmacy | 2026-05-05 | Sidebar, login, receipts |
| 3 | RTL-first CSS architecture | 2026-04 | Logical properties throughout |
| 4 | Tajawal font integration | 2026-04 | Arabic + Latin support |

---

## Cross-Role Requests

### To Frontend Developer

| # | Request | Priority | Status | Notes |
|---|---------|----------|--------|-------|
| 1 | Implement POS payment panel redesign | P0 | ⬜ | Waiting on design spec from this role |
| 2 | Add sidebar tooltips for collapsed state | P2 | ⬜ | After design is specified |
| 3 | Implement loading skeletons | P1 | ⬜ | After skeleton components are designed |

### To Rust Developer

| # | Request | Priority | Status | Notes |
|---|---------|----------|--------|-------|
| 1 | Return error codes with structured data | P0 | ⬜ | Need error type to show appropriate UI |

### To QA Engineer

| # | Request | Priority | Status | Notes |
|---|---------|----------|--------|-------|
| 1 | Visual regression test all pages in RTL | P1 | ⬜ | Screenshot comparison |
| 2 | Test receipt printing on 58mm and 80mm | P2 | ⬜ | Physical print verification |

---

## Design Review Checklist

Before approving any UI change, verify:

- [ ] Uses design tokens (no raw hex colors, no hardcoded spacing)
- [ ] RTL-safe (logical properties only)
- [ ] Consistent with existing component patterns
- [ ] Loading state defined
- [ ] Empty state defined
- [ ] Error state defined
- [ ] Responsive at 1024×768 minimum
- [ ] Focus states visible
- [ ] Touch targets ≥ 44px on interactive elements
- [ ] Arabic text renders correctly (no overlapping, no truncation)
- [ ] Numbers align correctly in tables (tabular-nums)
- [ ] i18n keys used (no hardcoded strings)
