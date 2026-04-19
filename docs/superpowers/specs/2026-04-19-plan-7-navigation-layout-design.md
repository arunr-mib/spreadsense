# SpreadSense Plan 7: Navigation & Layout Redesign — Design Spec

**Date:** 2026-04-19
**Status:** Approved

---

## Goal

Replace the current minimal top-header with an app-wide collapsible left sidebar, add a Borrower List page and Borrower Overview page, and add a breadcrumb to the Spread Detail page so borrowers become first-class navigable objects.

---

## Architecture Overview

Three additions to the existing system:

1. **Backend:** Add `borrower_id` query-param filter to `GET /spreads/` so the borrower overview page can list only that borrower's spreads.
2. **Frontend shell:** A new `MainLayout` component wraps all protected routes and renders a collapsible `Sidebar` plus an `<Outlet />` for page content. The `Sidebar` replaces the current per-page headers and logout buttons.
3. **Two new pages:** `BorrowerListPage` at `/borrowers` and `BorrowerOverviewPage` at `/borrowers/:id`.

---

## Backend

### Change: `GET /spreads/` — add `borrower_id` filter

**File:** `backend/app/modules/spreads/router.py`

Add an optional `borrower_id: int | None = Query(None)` parameter to the existing list endpoint. When provided, filter results to spreads where `Spread.borrower_id == borrower_id`. Ownership rules stay the same: analysts see only their own spreads (`Spread.created_by == user.id`); sr_credit_analyst and admin see all.

No schema changes required — the existing `SpreadRead` response model is sufficient.

### Tests (`backend/tests/test_spreads.py`)

Add 2 tests to the existing spreads test file:

1. `test_filter_by_borrower_id` — analyst gets only their own spreads for that borrower; another analyst's spread for the same borrower is excluded
2. `test_filter_by_borrower_id_sr_sees_all` — sr_credit_analyst gets all spreads for the borrower regardless of ownership

---

## Frontend

### New files

**`frontend/src/components/Sidebar.tsx`**

Collapsible left sidebar. Reads auth store directly via `useAuthStore`.

- **Expanded state** (~240px wide): SpreadSense logo + collapse toggle button (`‹`) top-right; nav items with icon + label; user name + role + "Sign out" at bottom.
- **Collapsed state** (~52px wide): collapse toggle (`›`) at top; icon-only nav items; user avatar circle only at bottom.
- **Collapse state** persisted to `localStorage` under key `sidebar_collapsed`. Initialise from localStorage on mount.
- **Nav items** (in order):
  - 📋 Deals → `/`
  - 🏢 Borrowers → `/borrowers`
  - 📊 Portfolio → `/dashboard` — only rendered when `user.role === 'sr_credit_analyst' || user.role === 'admin'`
- Active item determined by `useLocation()`: highlight item whose path is a prefix of `location.pathname`.
- Collapsed items show a `title` tooltip with the item label.
- **Sign out:** The bottom user section includes a "Sign out" button that calls `useAuthStore().logout()` and `navigate('/login')`.

**`frontend/src/components/MainLayout.tsx`**

```tsx
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

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

Route: `/borrowers`. Fetches two queries in parallel via React Query:
- `['borrowers']` → `getBorrowers()`
- `['spreads']` → `getSpreads()` (already cached if user visited the deal list)

**Spread count per borrower:** computed client-side as `spreads.filter(s => s.borrower_id === borrower.id).length`. Because `getSpreads()` applies server-side ownership filtering, analysts only see their own spreads — so the count reflects only their deals for that borrower, not the full team count. The column is labelled **"My Spreads"** for analysts and **"Spreads"** for sr/admin (read `user.role` from auth store to determine label).

**Last Spread date:** `max(spread.updated_at)` across all spreads for that borrower, formatted with `toLocaleDateString('en-US', { month: 'short', day: 'numeric' })`. If no spreads exist for that borrower, show `—`.

**Fiscal year end month:** Convert `borrower.fiscal_year_end_month` (1-based int) to a month name using `new Date(2000, month - 1).toLocaleString('default', { month: 'long' })`. Use this same conversion everywhere month names are displayed.

**Table columns:** Name (link to `/borrowers/:id`, amber), Industry, FY End, My Spreads / Spreads, Last Spread.

Loading and empty states required.

**`frontend/src/pages/BorrowerOverviewPage.tsx`**

Route: `/borrowers/:id`. Fetches:
- `getBorrowerById(id)` — wraps `GET /borrowers/{id}`
- `getSpreadsByBorrowerId(id)` — wraps `GET /spreads/?borrower_id={id}`

Renders:
1. **Header** — borrower name (skeleton while loading) + `← Borrowers` breadcrumb link to `/borrowers`
2. **Metadata cards** (4-up grid): Industry, SIC Code, FY End (use month name conversion above), Total Spreads (count of spreads array)
3. **Spreads table** — columns: Deal Name (link to `/spreads/:id`), Status (`StatusBadge`), Updated date. **Analyst column is omitted** — `SpreadRead.created_by` is a user ID integer, not a name; resolving it would require additional fetches not justified for this page. A future plan can enrich `SpreadRead` with `analyst_name`.

### Modified files

**`frontend/src/api/borrowers.ts`**

Add (return type `Borrower` is already defined in `../types`):
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

Add a breadcrumb in the page header. The `spread` object is already resolved via the cached `['spreads']` query (`spreads.find(s => s.id === spreadId)`). Use `spread.borrower_id` to fetch the borrower:

```tsx
const { data: borrower } = useQuery({
  queryKey: ['borrower', spread?.borrower_id],
  queryFn: () => getBorrowerById(spread!.borrower_id),
  enabled: !!spread?.borrower_id,
})
```

Render the breadcrumb above the deal name:
```tsx
<Link to={`/borrowers/${spread.borrower_id}`}>
  ← {borrower?.name ?? '...'}
</Link>
```

While `borrower` is loading, display `← ...` as the breadcrumb link text. Existing section tabs (Spreading / KPIs / Narrative / Memo) are unchanged.

Remove the existing per-page logout button and user display from `DealDashboardPage` — the sidebar handles these.

**`frontend/src/App.tsx`**

Replace the protected routes block:

```tsx
import MainLayout from './components/MainLayout'
import BorrowerListPage from './pages/BorrowerListPage'
import BorrowerOverviewPage from './pages/BorrowerOverviewPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
```

---

## What This Plan Does Not Include

- Analyst name in borrower spread table (requires `SpreadRead` schema enrichment — future plan)
- KPI ratio cards on borrower overview (user chose simple layout)
- Side-by-side PDF extraction viewer (Plan 8)
- Borrower create/edit UI (existing `NewSpreadModal` already handles borrower creation inline)
- Mobile/responsive layout for sidebar
