# TAJ Pharmacy — Prompt Engineering Plan for Pro UI/UX Polish

> **Purpose**: Ready-to-paste prompts for Windsurf Cascade, with model recommendations, to transform the app from "AI-generated" to "professional human-made SaaS product."

---

## Model Selection Guide

| Task Type | Recommended Model | Why |
|-----------|------------------|-----|
| UI component redesign (Button, Modal, Input) | **Claude Sonnet 4** | Needs design taste + system consistency |
| Page-level polish (Login, Dashboard, Onboarding) | **Claude Sonnet 4** | Needs holistic design thinking |
| Animation + transition system | **Claude Sonnet 4** | CSS animation expertise required |
| Skeleton/loading states | **GPT-4o** | Repetitive pattern, lower cost |
| PWA Owner Dashboard polish | **Claude Sonnet 4** | Design consistency across platforms |
| i18n key additions | **Gemini 2.5 Flash** | Mechanical, fast, cheap |
| Rust backend changes | **Claude Sonnet 4** | Correctness critical |
| Bug fixes from QA | **GPT-4o** | Focused scope, clear acceptance criteria |

**Rule of thumb**: If the task requires *taste* or *design judgment*, use Claude Sonnet 4. If it's *mechanical* or *repetitive*, use GPT-4o or Gemini Flash.

---

## Current "Not Pro" Patterns Found

| # | Pattern | Where | Why It Looks AI-Generated |
|---|---------|-------|--------------------------|
| 1 | `rounded-sm` on cards/modals | Login.tsx, Modal.tsx | Humans use `rounded-xl` or `rounded-2xl` for cards; `rounded-sm` is a tell |
| 2 | Hardcoded hex `bg-[#0FA3A6]` | Button.tsx primary variant | Design tokens exist (`bg-primary-500`) but aren't used consistently |
| 3 | No loading skeletons | Dashboard, all list pages | Plain "Loading..." text = instant AI tell |
| 4 | No micro-interactions | All interactive elements | No hover scale, no press feedback, no transition choreography |
| 5 | No empty states with illustration | List pages when empty | Blank or generic text instead of purposeful empty states |
| 6 | No toast enter/exit animation | Toast.tsx | Just appears/disappears |
| 7 | Login page is bare | Login.tsx | White card on ivory, no visual interest |
| 8 | No backdrop blur on modals | Modal.tsx | `bg-black/40` instead of `backdrop-blur-sm` |
| 9 | PWA uses inline styles | Home.tsx, all PWA pages | `style={{ borderTopColor: ... }}` instead of Tailwind |
| 10 | No data visualization | Dashboard | Has `salesTrend` data but no chart |
| 11 | No confirmation animations | After save/delete | No success checkmark burst, no error shake |
| 12 | Basic table styling | All tables | No alternating rows, no hover highlight |
| 13 | Sidebar collapsed = just title attr | Sidebar.tsx | No tooltip component, just native `title` |
| 14 | Onboarding step indicators basic | Onboarding.tsx | No progress animation, no step transition |
| 15 | No keyboard shortcut hints | POS page | Power users need visible shortcuts |

---

## Execution Phases

### Phase A — Design System Foundation (Do First)
This fixes the root cause: inconsistent tokens and missing utility classes.

### Phase B — Core Component Polish
Upgrade the 6 reusable UI components that every page depends on.

### Phase C — Page-Level Transformation
Apply the polished components + page-specific magic to each major page.

### Phase D — PWA Owner Dashboard Polish
Bring the cloud PWA to the same visual standard.

### Phase E — Delight & Micro-interactions
The final 10% that separates "clean" from "pro."

---

## Phase A — Design System Foundation

### Prompt A1: Fix CSS Token Gaps + Add Animation Utilities

**Model**: Claude Sonnet 4

```
You are polishing a Tauri 2 + React + Tailwind CSS v4 pharmacy SaaS app called "TAJ Pharmacy."

TASK: Upgrade `src/index.css` to add missing design system utilities and animation keyframes.

READ FIRST: `docs/AGENT-HANDOFF.md` (coding conventions), then `src/index.css` (current state).

ADD these to the `@theme {}` block:
1. `--animate-fade-in: fade-in 0.2s ease-out;`
2. `--animate-fade-up: fade-up 0.3s ease-out;`
3. `--animate-scale-in: scale-in 0.2s ease-out;`
4. `--animate-slide-in-right: slide-in-right 0.25s ease-out;`
5. `--animate-slide-in-left: slide-in-left 0.25s ease-out;`
6. `--animate-shimmer: shimmer 1.5s infinite;`
7. `--animate-check-burst: check-burst 0.4s ease-out;`
8. `--animate-shake: shake 0.4s ease-out;`

ADD these `@keyframes` after the `@theme {}` block:
- `fade-in`: from opacity 0 to 1
- `fade-up`: from opacity 0 + translateY(8px) to opacity 1 + translateY(0)
- `scale-in`: from opacity 0 + scale(0.95) to opacity 1 + scale(1)
- `slide-in-right`: from translateX(16px) to translateX(0) (for RTL: this slides from the start side)
- `slide-in-left`: from translateX(-16px) to translateX(0)
- `shimmer`: 0% background-position: -200% 0 → 100% background-position: 200% 0
- `check-burst`: 0% scale(0) → 50% scale(1.2) → 100% scale(1)
- `shake`: 0%,100% translateX(0) → 25% translateX(-4px) → 75% translateX(4px)

ADD these utility classes after the keyframes:
```css
.skeleton {
  background: linear-gradient(90deg, var(--color-ivory-muted) 25%, var(--color-ivory-border) 50%, var(--color-ivory-muted) 75%);
  background-size: 200% 100%;
  animation: var(--animate-shimmer);
  border-radius: 8px;
}

.skeleton-text { height: 14px; width: 80%; }
.skeleton-title { height: 20px; width: 60%; }
.skeleton-card { height: 120px; width: 100%; }
.skeleton-circle { border-radius: 50%; width: 48px; height: 48px; }
.skeleton-table-row { height: 48px; width: 100%; }

.animate-in {
  animation: var(--animate-fade-up);
}

.animate-in-fast {
  animation: var(--animate-fade-in);
}

.animate-scale-in {
  animation: var(--animate-scale-in);
}
```

UPDATE the existing `*, *::before, *::after` rule:
- REMOVE the `!important` on transition-duration and animation-duration (it breaks intentional animations)
- REPLACE with: `transition-duration: 150ms;` (no !important)

DO NOT:
- Change any existing color tokens or variable names
- Modify any component files (that's a separate task)
- Add console.log or use `any` type
```

---

### Prompt A2: Create Skeleton Component

**Model**: GPT-4o (mechanical pattern)

```
You are working on TAJ Pharmacy, a Tauri 2 + React + Tailwind CSS v4 desktop app.

READ FIRST: `docs/AGENT-HANDOFF.md` for coding conventions.

TASK: Create a reusable Skeleton component at `src/components/ui/Skeleton.tsx`.

The component should:
1. Accept props: `variant: 'text' | 'title' | 'card' | 'circle' | 'tableRow' | 'custom'`, `className?: string`, `count?: number` (default 1)
2. Use the `.skeleton` CSS class from `src/index.css` (already has shimmer animation)
3. For `variant='text'` → add `.skeleton-text` class
4. For `variant='title'` → add `.skeleton-title` class
5. For `variant='card'` → add `.skeleton-card` class
6. For `variant='circle'` → add `.skeleton-circle` class
7. For `variant='tableRow'` → add `.skeleton-table-row` class
8. For `variant='custom'` → just `.skeleton` + whatever className is passed
9. If `count > 1`, render that many skeleton elements with staggered animation-delay (each +150ms)
10. Export as default

Also create `src/components/ui/SkeletonCard.tsx` — a pre-built card skeleton:
```tsx
// A card-shaped skeleton that mimics the KpiCard layout:
// - Circle skeleton (top-left)
// - Title skeleton
// - Two text skeletons
// Wrapped in an app-card div with p-5
```

RULES:
- No `any` type
- Max 50 lines per function
- Use `cn()` utility if available, otherwise template literals for className merging
- No console.log
```

---

## Phase B — Core Component Polish

### Prompt B1: Upgrade Button Component

**Model**: Claude Sonnet 4

```
You are polishing the UI components of TAJ Pharmacy (Tauri 2 + React + Tailwind CSS v4).

READ FIRST: `docs/AGENT-HANDOFF.md`, then `src/components/ui/Button.tsx`, `src/index.css`.

TASK: Upgrade Button.tsx to look and feel like a pro SaaS product.

CURRENT ISSUES:
1. Uses hardcoded hex `bg-[#0FA3A6]` instead of design token `bg-primary-500`
2. No hover transition choreography (just color change)
3. No active/pressed visual feedback
4. No focus ring for accessibility
5. No loading spinner state

REQUIRED CHANGES:
1. Replace ALL hardcoded hex colors with design tokens:
   - `bg-[#0FA3A6]` → `bg-primary-500`
   - `hover:bg-[#0D8B8D]` → `hover:bg-primary-600`
   - `active:bg-[#0A7073]` → `active:bg-primary-700`

2. Add a `loading` prop (boolean). When true:
   - Show a small spinning SVG circle (12px) before the children
   - Set disabled=true automatically
   - Add `cursor-wait` class

3. Add transition choreography:
   - `transition-all duration-150 ease-out` on all variants
   - Primary: add subtle `hover:shadow-md` and `active:scale-[0.98]`
   - Secondary: add `hover:border-primary-300` for a hint of brand color on hover
   - Danger: add `active:scale-[0.98]`

4. Add focus ring: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500`

5. Add an `icon` variant for icon-only buttons:
   - Square aspect ratio, `p-2`, `rounded-xl`
   - Same color logic as ghost but with `hover:bg-ivory-muted`

6. Keep the existing API (variant, size, children, disabled, className, ...rest) — this is a non-breaking change.

DO NOT:
- Change the file to >80 lines (keep it tight)
- Add any `any` types
- Import external libraries
- Change how the Button is used in other files (that's a separate task)
```

---

### Prompt B2: Upgrade Modal Component

**Model**: Claude Sonnet 4

```
You are polishing TAJ Pharmacy UI components (Tauri 2 + React + Tailwind CSS v4).

READ FIRST: `docs/AGENT-HANDOFF.md`, then `src/components/ui/Modal.tsx`, `src/index.css`.

TASK: Upgrade Modal.tsx to professional SaaS quality.

CURRENT ISSUES:
1. `rounded-sm` on the modal card — dead giveaway of AI generation
2. No backdrop blur
3. No enter/exit animation
4. No size variants
5. Hardcoded Arabic confirm/cancel labels

REQUIRED CHANGES:
1. Change `rounded-sm` → `rounded-2xl`
2. Backdrop: change `bg-black/40` → `bg-black/50 backdrop-blur-sm`
3. Add enter animation: the modal card should use `animate-scale-in` class (defined in index.css)
4. Add `size` prop: `'sm' | 'md' | 'lg'` with max-widths:
   - sm: `max-w-sm`
   - md: `max-w-md` (default, current)
   - lg: `max-w-lg`
5. Replace hardcoded Arabic strings with i18n:
   - Import `useTranslation` from `react-i18next`
   - `confirmLabel` default → `t('common.confirm')`
   - `cancelLabel` default → `t('common.cancel')`
   - NOTE: If these i18n keys don't exist yet, add them to both `src/i18n/ar.json` and `src/i18n/en.json`
6. Add a subtle top-border accent for danger variant: `border-t-4 border-t-status-danger`
7. Add `role="dialog"` and `aria-modal="true"` for accessibility

Keep the existing props API. This is a non-breaking change.

DO NOT:
- Add external animation libraries
- Use `any` type
- Exceed 80 lines
```

---

### Prompt B3: Upgrade Input Component

**Model**: Claude Sonnet 4

```
You are polishing TAJ Pharmacy UI components (Tauri 2 + React + Tailwind CSS v4).

READ FIRST: `docs/AGENT-HANDOFF.md`, then `src/components/ui/Input.tsx`, `src/index.css`.

TASK: Upgrade Input.tsx to professional SaaS quality.

CURRENT ISSUES:
1. No `app-input` class is defined in index.css (it's referenced but missing)
2. No hover state
3. No icon support (prefix/suffix icons are common in pro apps)
4. Error state could be more visible

REQUIRED CHANGES:
1. Add the missing `app-input` class to `src/index.css` (add it near the existing `.app-card` and `.app-panel` classes):
```css
.app-input {
  background: var(--color-ivory-surface);
  border: 1.5px solid var(--color-ivory-border);
  border-radius: 10px;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.app-input:hover {
  border-color: var(--color-primary-300);
}
.app-input:focus {
  border-color: var(--color-primary-500);
  box-shadow: 0 0 0 3px rgb(15 163 166 / 0.12);
}
.app-input-error {
  border-color: var(--color-status-danger);
  box-shadow: 0 0 0 3px rgb(220 38 38 / 0.08);
}
```

2. Add `icon` and `iconPosition` props to Input:
   - `icon?: React.ReactNode`
   - `iconPosition?: 'start' | 'end'` (default 'start')
   - When icon is provided, add the icon element inside a wrapper div, and adjust padding accordingly (`ps-10` for start icon, `pe-10` for end icon)
   - Icon should be positioned absolutely, with `text-ink-muted` color

3. Improve error state: use the `app-input-error` class when `error` prop is truthy

4. Add `helperText` prop (optional string) — shows muted text below the input (for hints). Only show when no error.

DO NOT:
- Break existing Input usage (all current props must still work)
- Use `any` type
- Exceed 80 lines in Input.tsx
```

---

### Prompt B4: Create Toast Animation + Confirmation Feedback

**Model**: Claude Sonnet 4

```
You are polishing TAJ Pharmacy UI (Tauri 2 + React + Tailwind CSS v4).

READ FIRST: `docs/AGENT-HANDOFF.md`, then these files:
- `src/components/ui/Toast.tsx`
- `src/index.css`

TASK: Add professional toast animations and a new SuccessBurst micro-component.

1. UPGRADE Toast.tsx:
   - Add enter animation: `animate-slide-in-right` class (for LTR) / `animate-slide-in-left` (for RTL) — use `document.dir` or a CSS class to determine direction
   - Actually, simpler: just use `animate-fade-up` for all toasts (works in both directions)
   - Add exit animation: Before removing the toast, add a `opacity-0 translate-y-2 transition-all duration-200` class and wait 200ms before actually removing
   - To implement this: change Toast to use a `visible` state that starts true. On close, set visible=false, then after 200ms call onClose. Use useEffect for the timeout.
   - Add a subtle left-border accent: 4px border-l with color based on type (success=green, danger=red, warning=amber)

2. CREATE `src/components/ui/SuccessBurst.tsx`:
   - A small animated checkmark that appears briefly after a successful action
   - Props: `show: boolean`, `size?: number` (default 24), `className?: string`
   - When `show` becomes true, render a green circle with a white checkmark inside, using the `animate-check-burst` animation
   - Auto-hide after 1.5 seconds (useEffect with timeout)
   - Use Lucide's `Check` icon inside a `bg-status-success` circle

DO NOT:
- Use external animation libraries
- Use `any` type
- Add console.log
```

---

### Prompt B5: Create EmptyState Component

**Model**: GPT-4o

```
You are working on TAJ Pharmacy (Tauri 2 + React + Tailwind CSS v4).

READ FIRST: `docs/AGENT-HANDOFF.md` for conventions.

TASK: Create `src/components/ui/EmptyState.tsx` — a reusable empty state component.

Props:
- `icon?: React.ReactNode` — a Lucide icon element (e.g., <Package size={48} />)
- `title: string` — main message
- `description?: string` — secondary explanation
- `action?: { label: string; onClick: () => void }` — optional CTA button

Design:
- Centered vertically and horizontally within its container
- Icon: large (48px), `text-ink-placeholder` color, with subtle `animate-fade-in`
- Title: `text-lg font-bold text-ink-main`
- Description: `text-sm text-ink-muted max-w-xs text-center`
- Action button: `Button` component with `variant="primary"` and `size="sm"`
- Overall: `flex flex-col items-center justify-center gap-3 py-12`
- Add `animate-in` class for entrance animation

Also add i18n keys for common empty states to both `src/i18n/ar.json` and `src/i18n/en.json`:
- `common.emptyTitle` → "لا توجد بيانات" / "No data yet"
- `common.emptyDescription` → "ستظهر البيانات هنا عند توفرها" / "Data will appear here when available"

DO NOT:
- Use `any` type
- Exceed 50 lines
- Import external libraries beyond React and Lucide
```

---

## Phase C — Page-Level Transformation

### Prompt C1: Transform Login Page

**Model**: Claude Sonnet 4

```
You are transforming the TAJ Pharmacy login page from "functional" to "premium SaaS."

READ FIRST: `docs/AGENT-HANDOFF.md`, then `src/pages/Login.tsx`, `src/index.css`, `src/components/ui/Button.tsx`, `src/components/ui/Input.tsx`.

TASK: Redesign Login.tsx to look like a premium pharmacy SaaS product.

DESIGN DIRECTION:
- Split layout: Left side = brand panel with gradient, Right side = login form
- On mobile (< md): full-width form with brand header

LEFT PANEL (hidden on mobile, visible on md+):
- Full-height, `bg-gradient-to-br from-brand-700 via-brand-600 to-primary-600`
- Centered content: TAJ logo (the teal square with "TAJ" text), pharmacy name, tagline
- Subtle decorative pattern: use CSS `background-image` with a subtle dot grid or geometric pattern at low opacity (10%)
- At the bottom: a small "© 2026 TAJ Pharmacy" in white/50

RIGHT PANEL (always visible):
- `bg-ivory-surface` background
- Centered form, max-w-sm
- TAJ logo square at top (visible on mobile, hidden on md+ since left panel shows it)
- Form fields with the upgraded Input component
- "Remember me" checkbox (small, muted)
- Login button: full-width, `size="lg"`, with loading state
- Error message: use `animate-shake` class when error appears
- Bottom text: "نسخة سطح المكتب" / "Desktop Version" in small muted text

ANIMATION:
- Form inputs: staggered `animate-fade-up` with increasing delay (0, 50ms, 100ms)
- Button: `animate-fade-up` with 150ms delay
- Error: `animate-shake` when it appears

ACCESSIBILITY:
- `role="main"` on the page container
- Proper `aria-label` on the form
- Auto-focus username field (already exists, keep it)

DO NOT:
- Use any external image files (no hero.png, no SVG files — use CSS and inline SVG only)
- Change the login logic (useAuth, navigate, etc. stay the same)
- Use `any` type
- Exceed 150 lines
- Break RTL layout (use ms/me, ps/pe, rounded-s/e)
```

---

### Prompt C2: Transform Dashboard Page

**Model**: Claude Sonnet 4

```
You are transforming the TAJ Pharmacy Dashboard from "functional" to "premium SaaS."

READ FIRST: `docs/AGENT-HANDOFF.md`, then:
- `src/pages/Dashboard.tsx`
- `src/index.css`
- `src/components/ui/Skeleton.tsx` and `src/components/ui/SkeletonCard.tsx` (should exist from Phase A)

TASK: Upgrade Dashboard.tsx with loading skeletons, better KPI cards, and a mini sales chart.

CHANGES:

1. LOADING STATE: Replace the plain "Loading..." text with skeleton cards:
   - Import `SkeletonCard` from `../components/ui/SkeletonCard`
   - Show 4 `SkeletonCard` components in the same grid layout
   - Show 2 skeleton table rows for the activity section

2. KPI CARD UPGRADE: The existing `KpiCard` component inside Dashboard.tsx should be enhanced:
   - Add a subtle gradient background on hover: `hover:bg-gradient-to-br hover:from-ivory-surface hover:to-primary-50/30`
   - Add `transition-all duration-200` and `hover:shadow-md`
   - The trend sparkline (if it exists) should use `text-primary-500` stroke color
   - Add `animate-in` class with staggered delay per card (0, 50ms, 100ms, 150ms)

3. MINI SALES CHART: Add a simple SVG sparkline chart below the KPI cards:
   - Use the existing `salesTrend` data (last 7 days)
   - Render a simple SVG path (no chart library needed)
   - Width: full card width, Height: 80px
   - Stroke: `var(--color-primary-500)`, fill: gradient from `primary-500/20` to transparent
   - Wrap in an `app-card` with header "اتجاه المبيعات" / "Sales Trend"
   - If no data, show EmptyState component

4. STOCK ALERTS: Upgrade the stock alerts section:
   - Each `AlertItem` should have a subtle left-border accent (4px, matching variant color)
   - Add `animate-fade-in` with stagger

5. ACTIVITY TABLE: Add alternating row backgrounds:
   - Even rows: `bg-ivory-muted/30`
   - Hover: `hover:bg-primary-50/30`

DO NOT:
- Install any npm packages (no recharts, no chart.js)
- Change the data fetching logic
- Use `any` type
- Exceed 400 lines total for Dashboard.tsx
- Break RTL layout
```

---

### Prompt C3: Transform Onboarding Flow

**Model**: Claude Sonnet 4

```
You are transforming the TAJ Pharmacy onboarding flow from "functional" to "delightful."

READ FIRST: `docs/AGENT-HANDOFF.md`, then `src/pages/Onboarding.tsx`, `src/index.css`.

TASK: Upgrade Onboarding.tsx with premium step indicators, transitions, and visual polish.

CHANGES:

1. STEP INDICATOR UPGRADE: Replace the basic step indicators with a professional stepper:
   - Horizontal stepper at the top with connecting lines
   - Completed steps: green circle with Check icon, `bg-status-success text-white`
   - Current step: `bg-primary-500 text-white` with a subtle pulse animation (`animate-pulse` on the ring)
   - Future steps: `bg-ivory-border text-ink-muted`
   - Connecting lines: `h-0.5 flex-1` — completed = `bg-status-success`, current = `bg-primary-300`, future = `bg-ivory-border`
   - Step labels below circles (Arabic)

2. STEP TRANSITIONS: When moving between steps:
   - Outgoing step: `opacity-0 translate-x-4` transition (200ms)
   - Incoming step: `animate-fade-up` with 100ms delay
   - Use a `direction` state ('forward' | 'backward') to determine slide direction

3. STEP 1 (Pharmacy Info): Add a subtle illustration area:
   - A decorative pharmacy cross icon (✚) in `text-primary-200` at 120px size, positioned as a watermark behind the form
   - Use `absolute` positioning with `pointer-events-none opacity-20`

4. STEP 3 (License Activation): Improve the activation feedback:
   - Success: Show `SuccessBurst` component + green banner with checkmark
   - Error: Show `animate-shake` on the error message
   - While activating: Show a spinning loader inside the button (use Button's `loading` prop)

5. STEP 4 (Complete): Make the completion screen celebratory:
   - Large animated checkmark (use `animate-check-burst`)
   - "مرحباً بك في TAJ Pharmacy" / "Welcome to TAJ Pharmacy" in bold
   - Pharmacy name displayed
   - "ابدأ الآن" / "Get Started" button with `animate-fade-up` delay

6. OVERALL: Wrap the entire onboarding in a centered card:
   - `max-w-2xl mx-auto` container
   - `app-card` with `p-8`
   - Subtle `bg-gradient-to-b from-ivory-app to-ivory-surface` page background

DO NOT:
- Change the onboarding logic (completeOnboarding, activateLicenseCloud, etc.)
- Use external illustration files
- Exceed 500 lines
- Break RTL layout
```

---

### Prompt C4: Polish POS Page

**Model**: Claude Sonnet 4

```
You are polishing the TAJ Pharmacy POS (Point of Sale) page.

READ FIRST: `docs/AGENT-HANDOFF.md`, then `src/pages/POS.tsx`, `src/index.css`.

TASK: Add professional polish to the POS page — the most-used screen in the app.

CHANGES (keep each small and focused):

1. SEARCH RESULTS: Add hover highlight and keyboard navigation visual:
   - Highlighted result: `bg-primary-50 border-s-2 border-primary-500`
   - Each result: `hover:bg-ivory-muted transition-colors duration-100`
   - Add subtle `animate-fade-in` when results appear

2. CART ITEMS: Add quantity change micro-animation:
   - When quantity changes, briefly flash the row: `bg-primary-50/50` for 300ms
   - Use a `lastChangedId` state to track which item just changed

3. PAYMENT AREA: Improve the payment method buttons:
   - Active method: `ring-2 ring-primary-500 ring-offset-2` + `bg-primary-50`
   - Inactive: `hover:bg-ivory-muted`
   - Add `transition-all duration-150`

4. SESSION STATUS BAR: Add a live indicator:
   - Open session: green dot + "مفتوح" (pulsing green dot using `animate-pulse`)
   - No session: red dot + "مغلق"

5. EMPTY CART: Show EmptyState component instead of blank area:
   - Icon: `ShoppingCart` from Lucide
   - Title: "السلة فارغة" / i18n key `pos.emptyCart`
   - Description: "ابحث عن منتج لإضافته" / i18n key `pos.emptyCartHint`

6. RECEIPT PREVIEW: Add a subtle paper texture effect:
   - `bg-white` with `shadow-[0_2px_8px_rgb(0_0_0_/_0.08)]`
   - Dashed border at the bottom (receipt tear-off): `border-b-2 border-dashed border-ivory-border`

7. KEYBOARD SHORTCUT HINTS: Add a small `?` button in the top-right that shows a shortcuts overlay:
   - F2: New sale
   - F3: Park sale
   - F8: Print receipt
   - Esc: Clear search
   - +/-: Quantity
   - Delete: Remove item
   - Use i18n keys: `pos.shortcuts.*`

Add all new i18n keys to both `ar.json` and `en.json`.

DO NOT:
- Change any POS business logic (sale creation, payment, session management)
- Install npm packages
- Exceed 1300 lines total (it's already 1209)
- Break RTL layout
- Use `any` type
```

---

### Prompt C5: Polish Products, Sales, Purchases, Warehouse, Expenses, Reports Pages

**Model**: GPT-4o (repetitive pattern across pages)

```
You are polishing multiple list/table pages in TAJ Pharmacy (Tauri 2 + React + Tailwind CSS v4).

READ FIRST: `docs/AGENT-HANDOFF.md`, then these files:
- `src/pages/Products.tsx`
- `src/pages/Sales.tsx`
- `src/pages/Purchases.tsx`
- `src/pages/Warehouse.tsx`
- `src/pages/Expenses.tsx`
- `src/pages/Reports.tsx`
- `src/components/ui/EmptyState.tsx`
- `src/components/ui/Skeleton.tsx`

TASK: Apply consistent professional polish to ALL six pages. Make the SAME set of changes to each.

FOR EACH PAGE, apply these changes:

1. LOADING STATE: Replace any plain "Loading..." text with skeleton components:
   - List pages: Show 5-8 `Skeleton` with `variant='tableRow'`
   - Card pages: Show `SkeletonCard` components

2. EMPTY STATE: When a list/table has zero items, show the `EmptyState` component instead of a blank area:
   - Products: icon=Package, title from i18n `products.emptyTitle`
   - Sales: icon=FileText, title from i18n `sales.emptyTitle`
   - Purchases: icon=ShoppingBag, title from i18n `purchases.emptyTitle`
   - Warehouse: icon=Warehouse, title from i18n `warehouse.emptyTitle`
   - Expenses: icon=Receipt, title from i18n `expenses.emptyTitle`
   - Reports: icon=BarChart3, title from i18n `reports.emptyTitle`
   - Add all these i18n keys to both ar.json and en.json

3. TABLE ROW HOVER: Add to all table rows:
   - `hover:bg-primary-50/30 transition-colors duration-100`
   - Alternating rows: even rows get `bg-ivory-muted/20`

4. PAGE HEADER: Ensure each page has a consistent header pattern:
   - Title: `text-2xl font-bold text-ink-main`
   - Subtitle: `text-base text-ink-muted mt-1`
   - Action button aligned to the end side: `ms-auto`

5. SEARCH INPUT: If the page has a search input, add a Search icon prefix using the upgraded Input component's `icon` prop

6. FADE-IN ANIMATION: Add `animate-in` class to the main content container of each page

DO NOT:
- Change any business logic or data fetching
- Change any Rust backend code
- Use `any` type
- Exceed each file's current line count by more than 30 lines
- Break RTL layout
```

---

### Prompt C6: Polish Settings Page

**Model**: Claude Sonnet 4

```
You are polishing the TAJ Pharmacy Settings page.

READ FIRST: `docs/AGENT-HANDOFF.md`, then `src/pages/Settings.tsx`, `src/index.css`.

TASK: Upgrade the Settings page to look like a premium SaaS settings panel.

CHANGES:

1. TAB NAVIGATION: Replace basic tab buttons with a professional tab bar:
   - Vertical tab list on the start side (desktop), horizontal scrollable on mobile
   - Active tab: `bg-primary-50 text-primary-700 border-s-2 border-primary-500 font-semibold`
   - Inactive: `text-ink-muted hover:text-ink-main hover:bg-ivory-muted`
   - Each tab has its Lucide icon + label
   - Use `rounded-s-xl` for the active tab background

2. SECTION CARDS: Each settings section should be wrapped in `app-card` with:
   - Section title: `text-lg font-bold text-ink-main mb-4`
   - Section description: `text-sm text-ink-muted mb-6`
   - Form fields in a clean grid layout

3. SAVE BUTTON FEEDBACK: When settings are saved:
   - Show `SuccessBurst` briefly next to the save button
   - Button text changes to "✓ تم الحفظ" / "✓ Saved" for 2 seconds, then reverts

4. BACKUP TAB: Add visual status indicators:
   - Last backup: green checkmark + relative time ("منذ ساعتين" / "2 hours ago")
   - No backup yet: amber warning icon + "لم يتم عمل نسخة احتياطية بعد"
   - Backup size shown with appropriate unit (KB/MB)

5. LICENSE TAB: Improve the license display:
   - Active license: green badge with shield icon
   - Expiring soon: amber badge with countdown
   - Expired: red badge with renewal CTA
   - Feature list: checkmarks for enabled features, locks for disabled

DO NOT:
- Change settings save/load logic
- Exceed 800 lines
- Break RTL layout
```

---

## Phase D — PWA Owner Dashboard Polish

### Prompt D1: PWA Design System Alignment

**Model**: Claude Sonnet 4

```
You are polishing the TAJ Pharmacy Owner PWA (React + Vite, no i18n library).

READ FIRST: `docs/AGENT-HANDOFF.md`, then:
- `pms-cloud/web/src/index.css`
- `pms-cloud/web/src/pages/Home.tsx`
- `pms-cloud/web/src/pages/Dashboard.tsx`
- `pms-cloud/web/src/pages/Stock.tsx`
- `pms-cloud/web/src/pages/SalesList.tsx`
- `pms-cloud/web/src/pages/Balances.tsx`
- `pms-cloud/web/src/pages/Sync.tsx`
- `pms-cloud/web/src/pages/Products.tsx`

TASK: Replace ALL inline styles with Tailwind classes using the design token system, and add professional polish.

RULES FOR THIS TASK:
- The PWA has NO i18n library. All Arabic strings are inline. Keep them inline.
- The PWA uses the SAME CSS variables as desktop (defined in `pms-cloud/web/src/index.css`)
- Replace ALL `style={{ ... }}` with equivalent Tailwind classes
- Add the same skeleton, animation, and empty state patterns from the desktop app

SPECIFIC CHANGES:

1. `index.css`: Add the same animation keyframes and utility classes that were added to the desktop `src/index.css` (shimmer, fade-in, fade-up, scale-in, etc.)

2. `Home.tsx`:
   - Replace all inline styles with Tailwind classes
   - The loading spinner: replace inline style with Tailwind `border-2 border-transparent border-t-primary-600`
   - Add skeleton loading state (same pattern as desktop Dashboard)
   - The "Today hero" card: add `animate-fade-up` entrance
   - Stock alert items: add left-border accent colors

3. ALL PWA PAGES:
   - Replace `style={{ color: 'var(--color-ink-muted)' }}` with `text-ink-muted`
   - Replace `style={{ color: 'var(--color-ink-main)' }}` with `text-ink-main`
   - Replace `style={{ background: '...' }}` with appropriate Tailwind bg classes
   - Add empty states for pages with no data
   - Add `animate-in` on page entrance

4. `Sync.tsx`: Add sync health indicators:
   - Green dot + "متزامن" when last sync < 5 min ago
   - Yellow dot + "متأخر" when last sync > 5 min
   - Red dot + "غير متزامن" when last sync > 30 min or never

DO NOT:
- Add i18n library to the PWA
- Change any API calls or data logic
- Use `any` type
- Break mobile responsive layout
```

---

## Phase E — Delight & Micro-interactions

### Prompt E1: Sidebar Tooltip + Hover Effects

**Model**: GPT-4o

```
You are adding delight micro-interactions to TAJ Pharmacy (Tauri 2 + React + Tailwind CSS v4).

READ FIRST: `docs/AGENT-HANDOFF.md`, then `src/components/layout/Sidebar.tsx`.

TASK: Add professional tooltip and hover effects to the sidebar.

CHANGES:

1. TOOLTIP ON COLLAPSED: When sidebar is collapsed, show a proper tooltip on hover (not just native `title`):
   - Create a simple CSS-only tooltip using `group` + `group-hover`:
   - Each nav item wrapper gets `group relative`
   - Tooltip element: `absolute start-full top-1/2 -translate-y-1/2 ms-3 px-3 py-1.5 bg-ink-main text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 whitespace-nowrap z-50`
   - Only show when `collapsed` is true (conditional render)
   - Add a small arrow/caret pointing to the sidebar using a `::before` pseudo-element (or a small rotated square)

2. ACTIVE INDICATOR: Add a subtle active indicator bar:
   - Active nav item: add a 3px wide bar on the start side: `before:absolute before:start-0 before:top-1/2 before:-translate-y-1/2 before:w-[3px] before:h-6 before:bg-white before:rounded-e-full`
   - This creates a white pill indicator on the active item's left edge (right edge in RTL)

3. HOVER GLOW: Add a subtle hover glow effect:
   - `hover:shadow-[inset_0_0_12px_rgb(255_255_255_/_0.05)]`

4. COLLAPSE ANIMATION: Smooth width transition (already exists, verify it uses `transition-[width] duration-200`)

DO NOT:
- Add external tooltip libraries
- Change navigation items or routing logic
- Exceed 130 lines
- Break RTL layout
```

---

### Prompt E2: Table Component Upgrade

**Model**: Claude Sonnet 4

```
You are upgrading the Table component in TAJ Pharmacy (Tauri 2 + React + Tailwind CSS v4).

READ FIRST: `docs/AGENT-HANDOFF.md`, then `src/components/ui/Table.tsx`, `src/index.css`.

TASK: Upgrade the Table component to professional SaaS quality.

IF Table.tsx doesn't exist as a reusable component, CREATE it. If it does, UPGRADE it.

The Table component should support:
1. Props: `headers: string[]`, `rows: React.ReactNode[][]`, `onRowClick?: (idx: number) => void`, `loading?: boolean`, `emptyMessage?: string`, `stickyHeader?: boolean`

2. STYLING:
   - Container: `app-card overflow-hidden` (no border-radius on inner elements)
   - Header: `bg-ivory-muted/50 text-ink-muted text-xs font-semibold uppercase tracking-wider`
   - Rows: `border-b border-ivory-border last:border-0`
   - Alternating: even rows `bg-ivory-muted/20`
   - Hover: `hover:bg-primary-50/30 transition-colors duration-100`
   - Clickable rows: `cursor-pointer` when `onRowClick` is provided
   - Sticky header: `sticky top-0 z-10` when `stickyHeader` is true

3. LOADING STATE: When `loading=true`, show 5 skeleton table rows

4. EMPTY STATE: When `rows.length === 0` and not loading, show EmptyState component

5. Add corresponding CSS to `src/index.css` if needed for the table styling

DO NOT:
- Use `any` type
- Exceed 80 lines
- Import external table libraries
```

---

### Prompt E3: StatusBar + TopBar Polish

**Model**: GPT-4o

```
You are polishing the TAJ Pharmacy layout components.

READ FIRST: `docs/AGENT-HANDOFF.md`, then:
- `src/components/layout/TopBar.tsx`
- `src/components/layout/StatusBar.tsx`

TASK: Add professional polish to the top bar and status bar.

TOPBAR CHANGES:
1. Add a subtle bottom border: `border-b border-ivory-border`
2. Search input: add Search icon prefix using Input component's `icon` prop
3. Notification bell: add a subtle `animate-bounce` (single bounce, not infinite) when a new notification arrives — use a `justArrived` state that resets after 500ms
4. User avatar: add a subtle ring: `ring-2 ring-primary-200`

STATUSBAR CHANGES:
1. Add `bg-ivory-surface border-t border-ivory-border` for visual separation
2. Sync status indicator: green/yellow/red dot based on last sync time
3. License status: small badge showing plan name
4. Text size: `text-xs text-ink-muted`
5. Add `animate-fade-in` on mount

DO NOT:
- Change any business logic
- Exceed current file line counts by more than 20 lines
- Break RTL layout
```

---

## Prompt Usage Workflow

For each prompt, follow this process:

1. **Open Windsurf** → Start a new Cascade conversation
2. **Select the recommended model** (see model table above)
3. **Paste the prompt** exactly as written
4. **Let the agent read the files** it needs (it will use the READ FIRST instruction)
5. **Review the changes** before accepting
6. **Run `cargo check`** (if Rust files changed) and `tsc --noEmit` (if TS files changed)
7. **Update `docs/AGENT-HANDOFF.md`** — flip ⬜ to ✅ for completed work

### Execution Order

```
Phase A (foundation):
  A1 → A2

Phase B (components):
  B1 → B2 → B3 → B4 → B5

Phase C (pages):
  C1 → C2 → C3 → C4 → C5 → C6

Phase D (PWA):
  D1

Phase E (delight):
  E1 → E2 → E3
```

Each prompt is self-contained and can run independently after its dependencies are complete.

---

## Cost Optimization Tips

1. **Batch similar pages** — If Cascade is doing well on C5 (polishing 6 pages), let it finish all in one session instead of restarting
2. **Use GPT-4o for mechanical tasks** — Skeleton creation, i18n key additions, inline-style-to-Tailwind conversions
3. **Use Claude Sonnet 4 for design decisions** — Login redesign, Dashboard chart, Onboarding stepper
4. **Don't re-read files** — If you just finished A1 and start A2 in the same session, the agent already has context
5. **Verify after each phase** — Run the app, check visually, fix any issues before moving to the next phase
