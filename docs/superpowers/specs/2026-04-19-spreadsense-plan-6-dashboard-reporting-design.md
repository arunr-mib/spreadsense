# SpreadSense Plan 6: Dashboard & Reporting — Design Spec

**Date:** 2026-04-19  
**Status:** Approved

---

## Goal

Add a portfolio-level dashboard for `sr_credit_analyst` and `admin` users showing deal pipeline counts, ratio breach/near-threshold alerts, and an enriched deal table — with a one-click PDF export of the summary view.

---

## Architecture Overview

Three additions to the existing system:

1. **New `portfolio` backend module** — a single `GET /portfolio/summary` endpoint that aggregates status counts, breach alerts, and enriched spread summaries in one request.
2. **New `DashboardPage` frontend** — a `/dashboard` route rendering KPI cards, a pipeline bar chart, a breach alerts table, and a filterable spreads table.
3. **PDF export** — `window.print()` with `@media print` CSS on the dashboard page; no new server-side dependency.

Role-aware routing in `App.tsx` sends `sr_credit_analyst`/`admin` to `/dashboard` and `analyst` to `/` (existing deal list).

---

## Backend

### New module: `backend/app/modules/portfolio/`

```
portfolio/
  __init__.py
  router.py
  service.py
  schemas.py
```

### New endpoint

```
GET /portfolio/summary     → PortfolioSummary
```

Requires authentication. Only `sr_credit_analyst` and `admin` may call it — `analyst` receives HTTP 403.

### Schemas (`portfolio/schemas.py`)

```python
class BreachAlert(BaseModel):
    spread_id: int
    deal_name: str
    borrower_name: str
    ratio_name: str          # e.g. "dscr", "leverage"
    value: float | None
    threshold: float
    direction: str           # "min" (breach when below) or "max" (breach when above)
    severity: str            # "breach" or "near_threshold"

class SpreadSummary(BaseModel):
    id: int
    deal_name: str
    borrower_name: str
    status: str
    analyst_name: str        # resolved from spread.created_by → User.full_name
    alert_count: int         # total breaches + near-threshold for this spread
    updated_at: datetime

class StatusCounts(BaseModel):
    draft: int
    completed: int
    reviewed: int
    exported: int
    total: int               # sum of all statuses; avoids silent breakage if new statuses added

class PortfolioSummary(BaseModel):
    status_counts: StatusCounts
    breach_alerts: list[BreachAlert]
    spread_summaries: list[SpreadSummary]
```

### Service (`portfolio/service.py`)

**`get_portfolio_summary(user, db)`**

1. Verify caller role is `sr_credit_analyst` or `admin` — raise HTTP 403 otherwise.
2. Load all spreads (no ownership filter — sr sees all). Join `Spread` with `Borrower` (via `spread.borrower_id`) and `User` (via `spread.created_by`) to resolve `borrower_name` and `analyst_name`. The `created_by` FK is the correct field for analyst attribution; `assigned_reviewer` is not used here.
3. Compute `status_counts` by grouping on `spread.status`. Set `total = sum of all status buckets`.
4. For each spread, call the existing `analytics_service.get_analytics(spread_id, user, db)` (three arguments — the `user` arg is the sr_credit_analyst caller, which bypasses the analyst-only ownership filter inside that function). Take the most recent `actual` period if available; fall back to the most recent period of any type. Spreads with no periods produce no alerts.
5. Collect `BreachAlert` entries:
   - Rename `_DEFAULTS` in `analytics/service.py` to `DEFAULT_THRESHOLDS` (public) so the portfolio service can import and reference it without coupling to a private symbol. This is a one-line rename in the analytics module.
   - For each ratio in `period.breaches` → `severity = "breach"`. For each ratio in `period.near_threshold` → `severity = "near_threshold"`.
   - Per ratio, look up effective thresholds: check `LoanType` overrides on the spread first; fall back to `DEFAULT_THRESHOLDS`. This mirrors the logic already in `analytics/service.py` so threshold values in alerts match what the analytics page shows.
   - Include `direction` field: `"min"` for dscr, current_ratio, interest_coverage; `"max"` for leverage.
6. Build `SpreadSummary` entries: `alert_count = len(breaches) + len(near_threshold)`.
7. Sort `breach_alerts` by severity (breach first), then by deal name. Sort `spread_summaries` by `updated_at` descending.
8. Return `PortfolioSummary`.

**Performance note:** For small portfolios (< 200 spreads) per-spread analytics calls are acceptable. If the portfolio grows, a batch analytics query can be added later without changing the endpoint contract.

### Router (`portfolio/router.py`)

```python
@router.get("/portfolio/summary", response_model=PortfolioSummary)
async def get_portfolio_summary(db, user): ...
```

Register in `backend/app/main.py` alongside existing routers.

### Analytics module change

In `backend/app/modules/analytics/service.py`: rename `_DEFAULTS` → `DEFAULT_THRESHOLDS` (remove the leading underscore). Update all internal usages of `_DEFAULTS` in that file. This is the only change to the analytics module.

### Tests (`backend/tests/test_portfolio.py`) — 6 tests

1. `test_sr_can_access_summary` — 200, correct status counts including `total`
2. `test_analyst_cannot_access_summary` — 403
3. `test_breach_alerts_populated` — spread with ratio violation appears in `breach_alerts` with `severity="breach"` and correct `direction`
4. `test_near_threshold_included` — spread near threshold appears with `severity="near_threshold"`
5. `test_empty_portfolio` — no spreads → zero counts, empty arrays
6. `test_spread_summary_names_resolved` — `spread_summaries[0].borrower_name` and `analyst_name` match the fixture borrower and user (verifies join correctness)

Expected total after Plan 6 backend: 64 + 6 = **70 passing tests**.

---

## Frontend

### New files

**`frontend/src/types/index.ts`** — add new interfaces:

```typescript
export interface StatusCounts {
  draft: number
  completed: number
  reviewed: number
  exported: number
  total: number
}

export interface BreachAlert {
  spread_id: number
  deal_name: string
  borrower_name: string
  ratio_name: string
  value: number | null
  threshold: number
  direction: 'min' | 'max'
  severity: 'breach' | 'near_threshold'
}

export interface SpreadSummary {
  id: number
  deal_name: string
  borrower_name: string
  status: string
  analyst_name: string
  alert_count: number
  updated_at: string
}

export interface PortfolioSummary {
  status_counts: StatusCounts
  breach_alerts: BreachAlert[]
  spread_summaries: SpreadSummary[]
}
```

**`frontend/src/api/portfolio.ts`**

```typescript
getPortfolioSummary(): Promise<PortfolioSummary>
```

Uses the same `client` axios instance as all other API files.

**`frontend/src/components/RoleRoute.tsx`**

A wrapper component that checks the current user's role (from `useAuthStore`) and redirects if the role is not permitted:

```typescript
// Props: { allowedRoles: string[]; redirectTo: string; children: ReactNode }
// If user.role is not in allowedRoles → <Navigate to={redirectTo} replace />
// Otherwise → renders children
```

Used in `App.tsx` to gate `/dashboard` to `sr_credit_analyst` and `admin`. This keeps role enforcement at the routing layer and avoids embedding it in individual pages.

**`frontend/src/pages/DashboardPage.tsx`**

Fetches `getPortfolioSummary()` via React Query with key `['portfolio-summary']`.

Renders four sections top-to-bottom:

1. **Header row** — "Portfolio Overview" heading + "Export PDF" button (`window.print()`). Both are wrapped in a `no-print` CSS class so they hide on print.
2. **KPI cards** (4 cards in a row):
   - Total Deals — `status_counts.total`
   - Awaiting Review — `status_counts.completed` (amber)
   - Ratio Breaches — count of `breach_alerts` where `severity === 'breach'` (red)
   - Exported — `status_counts.exported`
3. **Middle row** (2 columns):
   - *Pipeline by Status* — horizontal CSS bar chart from `status_counts`; bars for Draft, Awaiting, Reviewed, Exported; no chart library; bar widths computed as `(count / total) * 100%`
   - *Breach & Near-Threshold Alerts* — table of `breach_alerts` with columns: Deal, Ratio, Value, Threshold; direction shown as "min" or "max" label next to threshold; ⛔ for breach, ⚠ for near_threshold
4. **Spreads table** — `spread_summaries` with columns: Deal Name (link to `/spreads/:id`), Borrower, Status (`StatusBadge`), Analyst, Alerts, Updated. Three quick-filter tabs above the table: **All**, **Awaiting Review** (status `completed`), **Breaches Only** (alert_count > 0). Active tab in local `useState`; filtering is client-side. Filter tabs are wrapped in `no-print` class.

**PDF export:** "Export PDF" button calls `window.print()`. `@media print` CSS added to `DashboardPage.tsx` (via a `<style>` tag or Tailwind's `print:` variants) targets elements with the `no-print` class and sets `display: none`. The page's own header section (the `<header>` element at the top of `DashboardPage`) is also hidden on print since it contains the nav and Export button. All four content sections render full-width on print.

### Modified files

**`frontend/src/App.tsx`**

1. Import `RoleRoute`.
2. Add `/dashboard` route wrapped in `RoleRoute` with `allowedRoles={['sr_credit_analyst', 'admin']}` and `redirectTo="/"`.
3. Post-login redirect logic: read `user.role` from `useAuthStore` after successful login and navigate to `/dashboard` (sr/admin) or `/` (analyst).

---

## What This Plan Does Not Include

- Analyst-level dashboard (analysts continue to use the existing deal list at `/`)
- Date range filtering (e.g., "deals created this month")
- Email/notification alerts when breaches are detected
- Trend analytics (ratio direction over time across periods)
- Server-side pagination for the portfolio summary
- Batch analytics optimisation (deferred until portfolio scale requires it)
