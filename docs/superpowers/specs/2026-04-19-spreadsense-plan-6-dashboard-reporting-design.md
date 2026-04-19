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
    severity: str            # "breach" or "near_threshold"

class SpreadSummary(BaseModel):
    id: int
    deal_name: str
    borrower_name: str
    status: str
    analyst_name: str
    alert_count: int         # total breaches + near-threshold for this spread
    updated_at: datetime

class StatusCounts(BaseModel):
    draft: int
    completed: int
    reviewed: int
    exported: int

class PortfolioSummary(BaseModel):
    status_counts: StatusCounts
    breach_alerts: list[BreachAlert]
    spread_summaries: list[SpreadSummary]
```

### Service (`portfolio/service.py`)

**`get_portfolio_summary(user, db)`**

1. Verify caller role is `sr_credit_analyst` or `admin` — raise HTTP 403 otherwise.
2. Load all spreads (no ownership filter — sr sees all). Join with `Borrower` and `User` tables to resolve `borrower_name` and `analyst_name`.
3. Compute `status_counts` by grouping on `spread.status`.
4. For each spread, call the existing `analytics_service.compute_analytics(spread_id, db)` (reuses `analytics/service.py` logic). Take the most recent `actual` period if available; fall back to the most recent period of any type.
5. Collect `BreachAlert` entries from `period.breaches` (severity `"breach"`) and `period.near_threshold` (severity `"near_threshold"`). Map ratio name → value and threshold using the same `THRESHOLDS` dict already defined in `analytics/service.py`.
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

### Tests (`backend/tests/test_portfolio.py`) — 5 tests

1. `test_sr_can_access_summary` — 200, correct status counts
2. `test_analyst_cannot_access_summary` — 403
3. `test_breach_alerts_populated` — spread with ratio violation appears in `breach_alerts` with `severity="breach"`
4. `test_near_threshold_included` — spread near threshold appears with `severity="near_threshold"`
5. `test_empty_portfolio` — no spreads → zero counts, empty arrays

Expected total after Plan 6 backend: 64 + 5 = **69 passing tests**.

---

## Frontend

### New files

**`frontend/src/types/index.ts`** — add three new interfaces:

```typescript
export interface StatusCounts {
  draft: number
  completed: number
  reviewed: number
  exported: number
}

export interface BreachAlert {
  spread_id: number
  deal_name: string
  borrower_name: string
  ratio_name: string
  value: number | null
  threshold: number
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

**`frontend/src/pages/DashboardPage.tsx`**

Fetches `getPortfolioSummary()` via React Query with key `['portfolio-summary']`.

Renders four sections top-to-bottom:

1. **Header row** — "Portfolio Overview" heading + "Export PDF" button (`window.print()`)
2. **KPI cards** (4 cards in a row):
   - Total Deals — `status_counts` total
   - Awaiting Review — `status_counts.completed` (amber)
   - Ratio Breaches — count of `breach_alerts` where `severity === 'breach'` (red)
   - Exported — `status_counts.exported`
3. **Middle row** (2 columns):
   - *Pipeline by Status* — horizontal CSS bar chart from `status_counts`; bars for Draft, Awaiting, Reviewed, Exported; no chart library
   - *Breach & Near-Threshold Alerts* — table of `breach_alerts` with columns: Deal, Ratio, Value, Threshold; ⛔ for breach, ⚠ for near_threshold
4. **Spreads table** — `spread_summaries` with columns: Deal Name (link to `/spreads/:id`), Borrower, Status (StatusBadge), Analyst, Alerts, Updated. Three quick-filter tabs above the table: **All**, **Awaiting Review** (status `completed`), **Breaches Only** (alert_count > 0). Active tab in local `useState`; filtering is client-side.

**PDF export:** "Export PDF" button calls `window.print()`. `@media print` CSS (inline in DashboardPage or in `index.css`) hides the nav bar, filter tabs, and action buttons; displays the four sections page-width with clean spacing.

### Modified files

**`frontend/src/App.tsx`**

Add `/dashboard` route protected by `ProtectedRoute`. After login, redirect based on role:
- `sr_credit_analyst` / `admin` → `/dashboard`
- `analyst` → `/` (existing deal list)

If an `analyst` navigates directly to `/dashboard`, redirect to `/`.

---

## What This Plan Does Not Include

- Analyst-level dashboard (analysts continue to use the existing deal list at `/`)
- Date range filtering (e.g., "deals created this month")
- Email/notification alerts when breaches are detected
- Trend analytics (ratio direction over time across periods)
- Server-side pagination for the portfolio summary
- Batch analytics optimisation (deferred until portfolio scale requires it)
