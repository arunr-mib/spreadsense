# SpreadSense Plan 4: PDF Credit Memo Export — Design Spec

**Date:** 2026-04-18
**Status:** Approved

---

## Goal

Enable credit analysts to export a professionally formatted, branded PDF credit memorandum directly from a spread. The memo combines data already in the system (financials, ratios, narrative) with a lightweight set of analyst-entered metadata (recommendation, risk rating, facility details), producing a committee-ready document without leaving the app.

---

## Architecture Overview

Three additions to the existing system:

1. **`credit_memo_meta` DB table** — one row per spread, stores the analyst-entered hybrid fields. Upserted (created on first save, updated on subsequent saves).
2. **`memo` backend module** — follows the existing `analytics`/`narrative` module pattern. Exposes `GET/PUT /spreads/{id}/memo/meta` for the form and `GET /spreads/{id}/memo/pdf` which assembles all data, renders a Jinja2 HTML template, and returns a WeasyPrint PDF as `application/pdf`.
3. **`MemoSection` frontend component** — a 4th tab added to the `RatioStrip` sub-nav (Spread | KPIs | Narrative | **Memo**). Contains the metadata form and an Export PDF button.

No new pages. No changes to existing modules beyond wiring the new router into `main.py` and adding the Memo tab to `RatioStrip`.

---

## Database

### New table: `credit_memo_meta`

```sql
CREATE TABLE credit_memo_meta (
    id              SERIAL PRIMARY KEY,
    spread_id       INTEGER NOT NULL UNIQUE REFERENCES spreads(id) ON DELETE CASCADE,
    recommendation  VARCHAR(32),   -- 'approve' | 'approve_with_conditions' | 'decline'
    risk_rating     VARCHAR(32),   -- 'pass' | 'watch' | 'special_mention' | 'substandard' | 'doubtful'
    facility_type   VARCHAR(64),   -- 'term_loan' | 'revolving_credit' | 'line_of_credit' | 'other'
    facility_amount NUMERIC(18,2), -- USD
    facility_purpose TEXT,
    facility_maturity VARCHAR(64), -- free text e.g. "5 years"
    collateral      TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`spread_id` has a `UNIQUE` constraint — enforces one-meta-per-spread at the DB level. The SQLAlchemy model uses `on_conflict_do_update` (upsert) so the frontend can always call PUT without first checking existence.

---

## Backend Module: `memo`

### File structure

```
backend/app/modules/memo/
├── __init__.py
├── schemas.py     — CreditMemoMetaRead, CreditMemoMetaWrite
├── service.py     — upsert_meta, get_meta, build_memo_context, render_pdf
└── router.py      — GET/PUT /spreads/{id}/memo/meta, GET /spreads/{id}/memo/pdf

backend/app/models/
└── credit_memo_meta.py   — SQLAlchemy model

backend/app/templates/
└── credit_memo.html      — Jinja2 + embedded CSS, rendered by WeasyPrint
```

### Schemas

```python
class CreditMemoMetaWrite(BaseModel):
    recommendation: str | None = None   # 'approve' | 'approve_with_conditions' | 'decline'
    risk_rating: str | None = None      # 'pass' | 'watch' | 'special_mention' | 'substandard' | 'doubtful'
    facility_type: str | None = None    # 'term_loan' | 'revolving_credit' | 'line_of_credit' | 'other'
    facility_amount: float | None = None
    facility_purpose: str | None = None
    facility_maturity: str | None = None
    collateral: str | None = None

class CreditMemoMetaRead(CreditMemoMetaWrite):
    id: int
    spread_id: int
    updated_at: datetime
    model_config = {"from_attributes": True}
```

All fields nullable — the form can be partially filled and saved at any time.

### Service

**`get_meta(spread_id, db)`** — returns `CreditMemoMeta | None`. Returns `None` (not 404) so the frontend can render an empty form.

**`upsert_meta(spread_id, data, db)`** — PostgreSQL `INSERT ... ON CONFLICT (spread_id) DO UPDATE SET ...`. Returns the saved row.

**`build_memo_context(spread_id, db)`** — assembles the full template context dict:
- `borrower`: name from `borrowers`
- `spread`: deal_name, loan_type thresholds
- `meta`: the `CreditMemoMeta` row (or all-None defaults)
- `periods`: list of `{fiscal_year, period_type, is_lines, cf_lines, ratios, breaches, near_threshold}` — IS and CF key lines selected from `spread_line_items`, ratios from analytics service
- `narrative`: latest `NarrativeVersion.content` (or `None`)
- `generated_at`: UTC timestamp string

**Key line selection for Financial Analysis table:**

`SpreadLineItem` rows are queried by `spread_period_id` (FK) + `statement` column ("IS" or "CF") + `rma_field_key` in the allowed set. The result is converted to a `dict[rma_field_key → value]` for the template. Example query pattern:

```python
items = await db.execute(
    select(SpreadLineItem)
    .where(
        SpreadLineItem.spread_period_id == period.id,
        SpreadLineItem.statement == "IS",
        SpreadLineItem.rma_field_key.in_(IS_KEY_FIELDS),
    )
)
```

| Statement | `rma_field_key` values included |
|-----------|-------------------------------|
| IS | `net_sales`, `gross_profit`, `ebitda`, `ebit`, `interest_expense`, `net_income` |
| CF | `cf_net_income`, `add_depreciation_amortization`, `capital_expenditures`, `uca_cfads`, `total_debt_service` |

Define these as module-level constants (`IS_KEY_FIELDS`, `CF_KEY_FIELDS`) in `service.py`.

**`render_pdf(spread_id, db)`** → `bytes` — calls `build_memo_context`, renders `credit_memo.html` via Jinja2, passes HTML string to `weasyprint.HTML(string=html).write_pdf()`. Returns raw PDF bytes.

### Router

```python
GET  /spreads/{id}/memo/meta    → CreditMemoMetaRead | {}  (200 always)
PUT  /spreads/{id}/memo/meta    → CreditMemoMetaRead        (upsert)
GET  /spreads/{id}/memo/pdf     → StreamingResponse(application/pdf)
```

**Note on GET /memo/meta:** When no row exists yet, return an empty dict `{}` (HTTP 200) rather than `null`. FastAPI cannot serialize `None` as `{}` by default — the router must explicitly `return {}` when `get_meta()` returns `None`. The frontend treats any response as the initial form state, defaulting all fields to `null`.

All three endpoints require authentication. Analysts see only their own spreads (same ownership pattern as analytics/narrative — 404 for others).

PDF endpoint sets headers:
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="credit_memo_{spread_id}_{date}.pdf"
```

---

## PDF Template

### Branding & Colors

The PDF uses the SpreadSense Sand & Amber palette — consistent with the web app.

| Role | Hex |
|------|-----|
| Page background | `#f5f0e8` |
| Card / alternating row | `#ede5d5` |
| Section header bar | `#d97706` (amber) |
| Section header text | `#ffffff` |
| Body text | `#1c1409` |
| Labels / subheadings | `#92805a` |
| Pass indicator | `#16a34a` |
| Near-threshold indicator | `#f59e0b` |
| Breach indicator | `#dc2626` |

**Header (every page top):** "SpreadSense" in amber left-aligned + "CREDIT MEMORANDUM" bold centered + generation date right-aligned.

**Footer (every page):** `CONFIDENTIAL | Generated by SpreadSense | Page N of M` — muted brown, small.

### Sections

1. **Executive Summary** — deal name, borrower name, recommendation badge (colour-coded: green=approve, amber=approve with conditions, red=decline), risk rating badge, top 3 ratios (DSCR, Leverage, Current Ratio) as inline highlights. The summary sentence is assembled from available fields: `"{borrower.name} is requesting a {facility_type} of {facility_amount} for the purpose of {facility_purpose}."` — any `None` field is replaced with `[Information not provided]` inline.

2. **Borrower Overview** — company name (from `borrowers.name`); all other fields (`[Information not provided]`): industry, business description, ownership structure, management team, years in business, relationship history.

3. **Transaction Structure** — rendered from meta fields. Any `None` field shows `[Information not provided]`. Fields: facility type, amount (formatted as USD), purpose, maturity, collateral. Static `[Information not provided]` for: interest rate, guarantees, secondary repayment source.

4. **Financial Analysis** — two sub-tables:
   - *Income Statement Summary*: IS key lines × all periods (columns = FY years)
   - *UCA Cash Flow Summary*: CF key lines × all periods
   - *Credit Ratios*: all 8 ratios × all periods, with ✓/⚠/✗ status indicators in the latest period column
   - *Projections/trends*: noted inline if projected periods exist
   - Industry benchmarks: `[Information not provided]`

5. **Risk Assessment** — programmatically derived:
   - *Strengths*: ratios in the latest period that pass thresholds (green)
   - *Weaknesses*: breached or near-threshold ratios with values noted
   - *Industry & market risks*: `[Information not provided]`
   - *Collateral coverage*: from meta collateral field or `[Information not provided]`
   - *Overall risk rating*: from meta

6. **Structure & Covenants** — financial covenants listed from `loan_type` thresholds (DSCR ≥ X.XX, Leverage ≤ X.XX, etc.). If no loan type set: `[Information not provided]`. Reporting requirements and other terms: `[Information not provided]`.

7. **Recommendation** — recommendation value displayed prominently (colour-coded badge). Full narrative text from the latest `NarrativeVersion` as rationale. Conditions precedent and policy exceptions: `[Information not provided]`.

Missing-data rule: any field not available in the DB shows `[Information not provided]` — never left blank, never inferred.

---

## Frontend

### Sub-nav change

`RatioStrip.tsx` gains a 4th nav item:

```tsx
{ key: 'memo', label: 'Memo' }
```

`SpreadDetailPage.tsx` `Section` type becomes `'spread' | 'kpis' | 'narrative' | 'memo'` and renders `<MemoSection spreadId={spreadId} />` for the memo tab.

### MemoSection component

`frontend/src/components/MemoSection.tsx`

**Layout:**
- Top: "Credit Memo Details" form — 7 fields, two-column grid, Save button
- Bottom: "Export PDF" button — triggers blob download

**Form behaviour:**
- Loads existing meta on mount via `GET /memo/meta`
- Saves on button click via `PUT /memo/meta`
- `isDirty` tracking (same pattern as NarrativeSection)
- All fields optional — partial saves allowed

**Export behaviour:**
```typescript
async function handleExport() {
  const blob = await exportMemoAsPdf(spreadId)           // arraybuffer response
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `credit_memo_${spreadId}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
```

### New API functions (`frontend/src/api/memo.ts`)

```typescript
getMemoMeta(spreadId: number): Promise<CreditMemoMeta>
saveMemoMeta(spreadId: number, data: CreditMemoMetaWrite): Promise<CreditMemoMeta>
exportMemoAsPdf(spreadId: number): Promise<ArrayBuffer>
```

### New TypeScript types (`frontend/src/types/index.ts` additions)

```typescript
export interface CreditMemoMeta {
  id?: number
  spread_id?: number
  recommendation: string | null
  risk_rating: string | null
  facility_type: string | null
  facility_amount: number | null
  facility_purpose: string | null
  facility_maturity: string | null
  collateral: string | null
  updated_at?: string
}
```

---

## Testing

### Backend tests (`backend/tests/test_memo.py`)

- `test_get_meta_returns_empty_when_none` — spread with no meta returns 200 with all-null fields
- `test_upsert_meta_creates_on_first_save`
- `test_upsert_meta_updates_on_second_save`
- `test_export_pdf_returns_bytes` — checks `Content-Type: application/pdf` and non-empty body; does not validate PDF internals
- `test_export_pdf_404_for_missing_spread`
- `test_export_pdf_analyst_cannot_access_other_spread` — 404 for cross-user access

WeasyPrint is not mocked in tests — it runs for real but the output is only checked for non-emptiness and content-type.

### Frontend

No automated frontend tests (consistent with existing project approach). Manual verification: form saves, PDF downloads, all 7 sections render.

---

## Dependencies

**New Python package:** `weasyprint` — add to `backend/pyproject.toml` dependencies. WeasyPrint requires system libraries (`pango`, `cairo`, `gdk-pixbuf`) that must be present in the dev environment. The plan includes a step to verify system deps are installed.

**Jinja2** — already available as a FastAPI optional dependency (`pip install fastapi[full]`). Verify it's in the venv before use.

---

## What This Plan Does Not Include

- PDF preview in the browser (open as new tab) — deferred; download is sufficient for now
- Editable rich-text fields for Strengths/Weaknesses — analyst fills those in on the printed doc
- Custom logo upload — "SpreadSense" text branding only
- Email delivery of the PDF — out of scope
- Industry benchmark data — `[Information not provided]` throughout
