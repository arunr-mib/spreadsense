# SpreadSense Plan 7: Navigation & Layout Redesign — Design Spec

**Date:** 2026-04-19
**Status:** Draft

---

## Goal

Replace the current minimal top-header with an app-wide collapsible left sidebar, add a Borrower List page and Borrower Overview page, and add a breadcrumb to the Spread Detail page so borrowers become first-class navigable objects.

---

## Architecture Overview

Three additions to the existing system:

1. **Backend:** Add `borrower_id` query-param filter to `GET /spreads/` so the borrower overview page can list only that borrower's spreads.
2. **Frontend shell:** A new `MainLayout` component wraps all protected routes and renders a collapsible `Sidebar` plus an `<Outlet />` for page content. The `Sidebar` replaces the current per-page headers.
3. **Two new pages:** `BorrowerListPage` at `/borrowers` and `BorrowerOverviewPage` at `/borrowers/:id`.

---

## Backend

### Change: `GET /spreads/` — add `borrower_id` filter

**File:** `backend/app/modules/spreads/router.py`

Add an optional `borrower_id: int | None = Query(None)` parameter to the existing list endpoint. When provided, filter results to spreads where `Spread.borrower_id == borrower_id`. Ownership rules stay the same: analysts see only their own spreads; sr_credit_analyst and admin see all.

No schema changes required — the existing `SpreadRead` response model is sufficient.

### Tests (`backend/tests/test_spreads.py`)

Add 2 tests to the existing spreads test file:

1. `test_filter_by_borrower_id` — analyst gets only their spreads for that borrower (other borrowers' spreads excluded)
2. `test_filter_by_borrower_id_sr_sees_all` — sr_credit_analyst gets all spreads for the borrower regardless of ownership

---

## Frontend

### New files

**`frontend/src/components/Sidebar.tsx`**

Collapsible left sidebar. Props: none (reads auth store directly).

- **Expanded state** (~240px): SpreadSense logo + collapse toggle (`‹`) at top; nav items with icon + label; user avatar + name + role at bottom.
- **Collapsed state** (~52px): collapse toggle (`›`) at top; icon-only nav items; user avatar only at bottom.
- **Collapse state** persisted to `localStorage` under key `sidebar_collapsed`.
- **Nav items:**
  - 📋 Deals → `/`
  - 🏢 Borrowers → `/borrowers`
  - 📊 Portfolio → `/dashboard` — only rendered when `user.role` is `sr_credit_analyst` or `admin`
- Active item highlighted using `useLocation()` to match current path prefix.
- Tooltip on icon-only items (HTML `title` attribute) showing the item label.

**`frontend/src/components/MainLayout.tsx`**

Thin wrapper used as the layout route element in `App.tsx`:

```tsx
export default function MainLayout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  )
}
```

**`frontend/src/pages/BorrowerListPage.tsx`**

Route: `/borrowers`. Fetches `getBorrowers()` (existing API function).

Renders a full-page table with columns: **Name** (link to `/borrowers/:id`), **Industry**, **FY End** (month name, e.g. "December"), **Spreads** (count from `borrower.spread_count` — see API note below), **Last Spread** date.

Loading and empty states required.

> **API note:** `getBorrowers()` currently returns the raw `Borrower[]` from the existing endpoint. The backend `GET /borrowers/` does not return a spread count. Rather than adding a new field to the borrower schema, the frontend fetches `getSpreads()` once (which analysts already call on the deal list page) and computes counts client-side by grouping on `spread.borrower_id`.

**`frontend/src/pages/BorrowerOverviewPage.tsx`**

Route: `/borrowers/:id`. Fetches:
- `getBorrowerById(id)` — new frontend function wrapping existing `GET /borrowers/{id}`
- `getSpreadsByBorrowerId(id)` — new frontend function calling `GET /spreads/?borrower_id={id}`

Renders:
1. **Header** — borrower name + `← Borrowers` breadcrumb link to `/borrowers`
2. **Metadata cards** (4-up grid): Industry, SIC Code, FY End (month name), Total Spreads (count)
3. **Spreads table** — columns: Deal Name (link to `/spreads/:id`), Status (`StatusBadge`), Analyst (from `spread.created_by` — not currently returned by `SpreadRead`; see note), Updated date

> **Analyst name note:** The existing `SpreadRead` schema does not include `analyst_name`. Rather than changing the backend schema, the `BorrowerOverviewPage` displays the `created_by` user ID as a fallback, or omits the Analyst column. This is a known limitation — a future plan can enrich `SpreadRead` with `analyst_name`.

### Modified files

**`frontend/src/api/borrowers.ts`**

Add:
```typescript
export async function getBorrowerById(id: number): Promise<Borrower> {
  const resp = await apiClient.get<Borrower>(`/borrowers/${id}`)
  return resp.data
}
```

**`frontend/src/api/spreads.ts`**

Add:
```typescript
export async function getSpreadsByBorrowerId(borrowerId: number): Promise<Spread[]> {
  const resp = await apiClient.get<Spread[]>(`/spreads/?borrower_id=${borrowerId}`)
  return resp.data
}
```

**`frontend/src/pages/SpreadDetailPage.tsx`**

Add a breadcrumb in the page header:

```
← {borrower.name}  /  {spread.deal_name}
```

- `← {borrower.name}` is a `<Link to={/borrowers/${spread.borrower_id}}>` 
- The spread already has `borrower_id`; the borrower name is fetched via `getBorrowerById(spread.borrower_id)` (React Query, cached)
- The existing section tabs (Spreading / KPIs / Narrative / Memo) are unchanged

**`frontend/src/App.tsx`**

Wrap all protected routes in `MainLayout`:

```tsx
<Route element={<ProtectedRoute />}>
  <Route element={<MainLayout />}>
    <Route path="/" element={<DealDashboardPage />} />
    <Route path="/borrowers" element={<BorrowerListPage />} />
    <Route path="/borrowers/:id" element={<BorrowerOverviewPage />} />
    <Route path="/spreads/:id" element={<SpreadDetailPage />} />
    <Route element={<RoleRoute allowedRoles={['sr_credit_analyst', 'admin']} redirectTo="/" />}>
      <Route path="/dashboard" element={<DashboardPage />} />
    </Route>
  </Route>
</Route>
```

Remove the existing per-page logout button and user display from `DealDashboardPage` — the sidebar now handles user context.

---

## What This Plan Does Not Include

- Analyst name in borrower spread table (requires `SpreadRead` schema enrichment — future plan)
- KPI ratio cards on borrower overview (user chose simple layout)
- Side-by-side PDF extraction viewer (Plan 8)
- Borrower create/edit UI (existing `NewSpreadModal` already handles borrower creation inline)
- Mobile/responsive layout for sidebar
