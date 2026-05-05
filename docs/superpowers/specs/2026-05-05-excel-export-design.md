# Excel Export — Design Spec

**Status:** Shipped May 5, 2026
**Owner:** SpreadSense
**Related PRD:** §7.12, F-51 to F-54

## Goal

Let the analyst hand a credit committee an `.xlsx` with the spread numbers laid out in a clean table — IS, BS, CF on separate sheets, periods side-by-side, totals visually distinguished. Replaces the alternative (export to CSV → re-format manually in Excel) that adds 15–30 minutes per deal.

## Non-Goals (v1)

- Bank-branded layouts (logo, colors, footer). v2.
- Embedded formulas / tie-out cells. The exported numbers are static snapshots of the line-item store at export time.
- Ratios / analytics sheet. v2 — would render the values currently shown on the KPIs tab.
- Variance commentary embedded in the workbook. v2 — render under a "Commentary" sheet.
- PDF export. Already exists for the Memo module via WeasyPrint; this spec is .xlsx only.

## Architecture

### Backend module: `app/modules/excel_export/`

```
app/modules/excel_export/
├── __init__.py
├── router.py     # GET /spreads/{id}/export.xlsx
└── service.py    # build_excel — openpyxl workbook construction
```

**Endpoint contract:**
```
GET /spreads/{spread_id}/export.xlsx
Auth: required
200 → application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
       Content-Disposition: attachment; filename="{Borrower}_Spread_{id}.xlsx"
       Access-Control-Expose-Headers: Content-Disposition
404 → spread not found / not owned
422 → no periods on the spread
```

**Service flow:**
1. `_get_spread_with_borrower` — auth + ownership; returns Spread + Borrower row.
2. `_load_periods_with_items` — pulls periods ascending by fiscal_year, with all their line items grouped by statement.
3. For each statement (IS, BS, CF), `_write_statement_sheet` builds a sheet:
   - Banner rows (borrower name, deal label, statement title).
   - Header row at row 5: "Line Item" + one column per fiscal year. Indigo background `#4338CA`, white bold text.
   - Body rows: humanized field name (`net_sales` → "Net Sales"; `sg_and_a` → "SG&A") + values, accounting number format `#,##0;(#,##0);"-"`.
   - Total rows (any field with "total" in the key, plus `ebitda`, `ebit`, `net_income`, `gross_profit`) highlighted with a light-indigo fill `#EEF2FF` and bold font.
   - Borders on every cell, column widths sized to fit.
4. Workbook saved to a `BytesIO`, returned alongside a sanitized filename.

### Frontend: `frontend/src/api/excelExport.ts`

`downloadSpreadXlsx(spreadId)` performs an `axios.get` with `responseType: 'blob'` and `validateStatus: () => true` so error JSON can still be parsed. On success, parses the filename from `Content-Disposition`, creates a temporary `<a download>` anchor, and clicks it programmatically.

### Frontend integration

A secondary button **`⬇ Export Excel`** is rendered in the `SpreadDetailPage` header next to `WorkflowControls`. Click → triggers `downloadSpreadXlsx`. Errors surface via `alert()` for v1 (acceptable for a low-frequency action; v2 can use a toast).

## Filename Convention

`{Borrower}_Spread_{id}.xlsx`, where the borrower name is sanitized to alphanumeric + underscores and capped at 40 characters. Example: `UAT_Docusign2_Inc_Spread_1.xlsx`.

## Validated Live (May 5, 2026)

Tested via `curl https://spreadsense-production.up.railway.app/spreads/1/export.xlsx`:
- HTTP 200, `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `Content-Disposition: attachment; filename="UAT_Docusign2_Inc_Spread_1.xlsx"`
- File size 7.4 KB, opens cleanly in macOS Preview as a valid Microsoft Excel 2007+ workbook.

## Dependencies

- **`openpyxl >= 3.1`** added to `backend/pyproject.toml`. Pure-Python, no native libs.

## Testing

Deferred to manual smoke. The export is deterministic (no AI) and exercised end-to-end by the demo flow; bugs would surface immediately on file open.

## Risks Accepted

- **No formulas** — the exported file is a snapshot. If the analyst edits the source spread and re-exports, the .xlsx replaces; if they edit the .xlsx directly, those changes don't sync back. Acceptable for hand-off to credit committee, which doesn't expect bidirectional sync.
- **Bank branding deferred to v2** — current header is generic indigo. Low-effort upgrade when needed.
- **No ratio sheet in v1** — committees can read ratios off the line items but typically prefer them as a separate page. v2 candidate.
