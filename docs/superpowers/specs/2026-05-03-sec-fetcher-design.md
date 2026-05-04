# SEC Filing Fetcher — Design Spec

**Status:** Draft v1 — approved 2026-05-03
**Owner:** SpreadSense
**Related:** `docs/SpreadSense-AI-PRD.md`, `scripts/fetch_10k_pdf.py` (reference implementation)

## Goal

Let analysts pull a public company's most recent 10-K or 10-Q from SEC EDGAR
straight into SpreadSense, without leaving the spread page or running a local
script. Eliminates a manual SEC navigation + browser-print step that currently
takes 2–5 minutes per filing.

## Non-Goals (v1)

- Caching fetched PDFs across requests.
- Browsing or selecting historical filings (only the latest of each form).
- Auto-uploading the fetched PDF into the extraction pipeline (analyst still
  uploads it via the existing control).
- Forms other than 10-K and 10-Q (no 8-K, S-1, proxy, etc.).
- Bulk fetch for multiple tickers.

## User Flow

1. Analyst opens a spread's `ExtractionPanel`. Below the existing "Choose file"
   upload, a new section appears: **Fetch the doc from SEC.gov site**.
2. Analyst types a ticker (e.g. `msft`), keeps form selector on `10-K (annual)`,
   clicks **Fetch latest 10K/Q**.
3. Button enters loading state: spinner + "Looking up filing on SEC.gov…
   Rendering PDF (this can take 10–30 seconds for a 200-page 10-K)".
4. Backend resolves ticker → CIK → latest filing of the chosen form, downloads
   the primary HTML document, renders it to PDF, and streams it back as a
   download.
5. Browser saves `MSFT_10-K_2024-07-30.pdf`. Success message appears below the
   row: "✓ Downloaded MSFT_10-K_2024-07-30.pdf (4.2 MB, 187 pages) — Now click
   'Choose file' above to upload it."
6. Analyst clicks the existing **Choose file** button, picks the just-downloaded
   PDF. Existing extraction flow takes over from here, unchanged.

## Architecture

### New backend module: `app/modules/sec_fetcher/`

```
app/modules/sec_fetcher/
├── __init__.py
├── router.py          # FastAPI route
├── service.py         # Orchestration
├── edgar_client.py    # SEC EDGAR API client
└── renderer.py        # HTML → PDF via WeasyPrint
```

**`router.py`** — single endpoint:

```
GET /sec/fetch?ticker={t}&form={10-K|10-Q}
Auth: required (existing JWT)
200 → application/pdf, Content-Disposition: attachment; filename="{TICKER}_{FORM}_{FILING_DATE}.pdf"
404 → ticker not found OR no filing of that form
502 → render failure (with SEC fallback URL in body)
503 → SEC rate-limited us
```

**`edgar_client.py`** — wraps SEC's public APIs. No third-party SDK.

- `resolve_cik(ticker: str) -> str`
  - Hits `https://www.sec.gov/files/company_tickers.json` (cached in-memory
    for 24h via simple module-level dict + timestamp; first request after boot
    populates it).
  - Returns 10-digit padded CIK or raises `TickerNotFoundError`.
- `find_latest_filing(cik: str, form: str) -> FilingRef`
  - Hits `https://data.sec.gov/submissions/CIK{padded}.json`.
  - Walks `filings.recent` for the first entry where `form == form_arg`.
  - Returns `FilingRef(url, filing_date, accession_number)`.
- All requests use `User-Agent: "SpreadSense (contact@adamsmind.ai)"`.

**`renderer.py`** — `render_html_url_to_pdf(url: str) -> bytes`

- `httpx.get(url, headers={"User-Agent": ...}, timeout=30s)` to fetch HTML.
- `weasyprint.HTML(string=html, base_url=url).write_pdf()` to render.
- Wrapped in `asyncio.wait_for(..., timeout=60)`. Returns raw PDF bytes.
- WeasyPrint runs in `run_in_executor` (it's blocking/CPU-bound).
- On `TimeoutError` or any WeasyPrint exception: raise `RenderError` with the
  source URL so the route can include it in the 502 body.

**`service.py`** — `fetch_filing(ticker, form) -> (pdf_bytes, filename)`

- Composes the three steps above.
- Builds filename: `{TICKER_UPPER}_{FORM}_{YYYY-MM-DD}.pdf`.

### Frontend changes

**Only `frontend/src/components/ExtractionPanel.tsx` is touched.**

New subcomponent `SecFetchControl.tsx` (~80 lines, lives in same directory):

```tsx
export function SecFetchControl({ disabled }: { disabled?: boolean }) {
  const [ticker, setTicker] = useState('')
  const [form, setForm] = useState<'10-K' | '10-Q'>('10-K')
  const [status, setStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'success'; filename: string; sizeBytes: number }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' })

  async function onFetch() {
    setStatus({ kind: 'loading' })
    try {
      const res = await fetch(
        `/api/sec/fetch?ticker=${encodeURIComponent(ticker)}&form=${form}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: 'Unknown error' }))
        setStatus({ kind: 'error', message: body.detail })
        return
      }
      const blob = await res.blob()
      const filename = parseContentDispositionFilename(res.headers.get('content-disposition'))
      triggerBrowserDownload(blob, filename)
      setStatus({ kind: 'success', filename, sizeBytes: blob.size })
    } catch (err) {
      setStatus({ kind: 'error', message: 'Network error — try again' })
    }
  }

  // ... render: input, select, button, status line
}
```

Mounted inside `ExtractionPanel` directly under the existing upload row, with
an `— OR —` divider between them. No state plumbing into the parent — the
fetch result is purely a browser download; the analyst then uses the existing
upload control.

### Data Flow

```
[UI] ticker, form
  → GET /api/sec/fetch (Vercel rewrite → Railway)
    → service.fetch_filing()
      → edgar_client.resolve_cik()              [SEC company-tickers.json]
      → edgar_client.find_latest_filing()       [SEC submissions/CIK*.json]
      → renderer.render_html_url_to_pdf()       [SEC primary doc → WeasyPrint]
    ← StreamingResponse(pdf_bytes,
        media_type='application/pdf',
        headers={Content-Disposition: attachment; filename="..."})
[UI] saves blob via download link, shows success message
```

## Visual Spec

Locked-in mockup (saved at `.superpowers/brainstorm/.../extraction-panel-mockup-v2.html`):

- **Section header:** `Fetch the doc from SEC.gov site` (uppercase label, indigo)
- **Layout:** ticker input (180px, uppercase), form `<select>` (10-K / 10-Q),
  `Fetch latest 10K/Q` button (indigo `#6366f1`)
- **Helper text:** `Downloads the most recent financial filing as a PDF file. Then upload it above.`
- **Loading message:** `Looking up filing on SEC.gov… Rendering PDF (this can take 10–30 seconds for a 200-page 10-K)`
- **Success:** green `✓ Downloaded {filename} ({size}, {pages} pages) — Now click "Choose file" above to upload it.`
  *(Pages count comes from a `X-PDF-Pages` response header set by the renderer.)*
- **Error:** red `✗ {detail}. Check the symbol or browse SEC.gov site directly.` with link to `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={ticker}`
- **Divider above SEC row:** `— OR —` (subtle gray)
- **Container:** white card, indigo `4px` left border, 1px `#c7d2fe` border

## Error Handling

| Condition | HTTP | Message shown to user |
|---|---|---|
| Empty ticker | (client-side) | Button stays disabled |
| Ticker not in SEC index | 404 | `No SEC filings found for ticker "{T}".` |
| Ticker found but no 10-K/10-Q in recent | 404 | `No recent {form} found for {T}.` |
| SEC API returns 429 | 503 | `SEC is rate-limiting us — retry in a moment.` |
| HTML fetch timeout (>30s) | 502 | `Could not download filing from SEC. Try again or browse SEC.gov directly.` |
| WeasyPrint timeout (>60s) or exception | 502 | `Could not render the filing. Try downloading from SEC directly: {url}` |
| Network error from browser → backend | (client) | `Network error — try again` |

All error responses use FastAPI's `HTTPException(detail=...)`. The frontend
reads `body.detail`. The SEC fallback link is always shown in error states so
the analyst is never stuck.

## Security & Rate-Limiting

- Endpoint requires JWT auth (existing dependency).
- Outbound `User-Agent` is `SpreadSense (contact@adamsmind.ai)` — SEC requires
  identifiable UAs and blocks default Python/Chrome UAs.
- No per-user throttling in v1. SEC's own rate limit (10 req/sec per IP) is the
  effective ceiling. If we hit it from Railway, surface 503 to user.
- WeasyPrint render runs with `asyncio.wait_for(..., timeout=60)` to prevent
  one bad filing from holding a worker.
- HTML fetched from SEC is not rendered in any browser context server-side
  (WeasyPrint renders it to PDF in isolation). No JS execution.

## Dependencies

- **`weasyprint`** — already a dependency (used by `app/modules/memo/`). No
  new install required.
- **`httpx`** — already in pyproject.
- No frontend additions.

## Risks

1. **WeasyPrint render quality on SEC's complex tables.**
   Headless Chrome (used in the local script) handles SEC's nested tables and
   inline styles better than WeasyPrint. There is a real chance some 10-Ks
   render with broken table cells, missing borders, or misaligned columns —
   reducing extraction quality downstream.
   - **Mitigation:** During implementation, smoke-test 5 tickers (MSFT, DOCU,
     AAPL, AMZN, META). If any produce unusable PDFs, decide before shipping
     whether to (a) accept v1 limitation and document affected companies, or
     (b) escalate to v2 with bundled Chromium.
2. **WeasyPrint memory pressure on Railway.**
   Rendering a 200-page 10-K can use 200–500MB RAM. Railway's hobby tier has
   512MB. If it OOMs, the worker dies and request fails.
   - **Mitigation:** Confirm Railway plan headroom during implementation. If
     constrained, document the limit and surface a clear error.
3. **SEC blocks our User-Agent.**
   Possible if traffic from Railway IP looks abusive.
   - **Mitigation:** UA includes contact email (SEC's stated requirement); if
     blocked, error message includes direct SEC link as fallback.
4. **Render time exceeds user patience.**
   30s feels long in a UI. No streaming progress to show.
   - **Mitigation:** Loading message sets expectation upfront ("can take
     10–30 seconds"). v2 could add an async job + polling pattern matching
     the existing extraction flow if this becomes a real complaint.

## Testing

### Unit tests (`backend/tests/test_sec_fetcher.py`)

- `test_resolve_cik_known_ticker` — mock `company_tickers.json`, assert MSFT → padded CIK
- `test_resolve_cik_unknown_ticker_raises` — assert `TickerNotFoundError`
- `test_find_latest_filing_picks_first_matching_form` — fixture with
  interleaved 10-K / 10-Q / 8-K, assert correct one returned
- `test_find_latest_filing_no_match_raises` — fixture with no 10-Ks
- `test_filename_format` — assert `MSFT_10-K_2024-07-30.pdf`
- `test_render_timeout_raises_render_error` — mock WeasyPrint to hang past timeout

### Integration test (skipped in CI)

- `test_live_fetch_msft_10k` — marked `@pytest.mark.live`, hits real SEC,
  asserts non-empty PDF returned. Documented in test runner config.

### Frontend tests (`frontend/src/components/__tests__/SecFetchControl.test.tsx`)

- Renders with empty input → button disabled
- Type ticker → button enabled
- Mock fetch success → success message shown with filename
- Mock fetch 404 → error message shown
- Click during loading → button disabled (no double-fire)

### Manual smoke

- Type `msft` + 10-K → download successful, file opens in PDF viewer
- Type `aapl` + 10-Q → download successful
- Type `zzzz` → see error message
- Spam click during loading → only one request fires (button disabled)

## Documentation Updates

- Add a "Fetching from SEC" section to `docs/SpreadSense-Explainer.md`
- Note the new endpoint in `docs/Deployment-Runbook.md` (no new env vars)
- Bump `docs/SpreadSense-AI-PRD.md` to v1.3 with the SEC fetcher milestone

## Open Questions

None — design locked at brainstorm 2026-05-03.
