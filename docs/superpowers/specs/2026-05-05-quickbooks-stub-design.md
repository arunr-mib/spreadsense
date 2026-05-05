# QuickBooks Online Connector — Design Spec (v1: Demo Stub)

**Status:** Stub shipped May 5, 2026 · Real OAuth target Q3 2026
**Owner:** SpreadSense
**Related PRD:** §7.11, F-47 to F-50

## Goal

Demonstrate the direct-accounting-system ingestion pattern in the demo flow without taking on the operational complexity of live OAuth + token refresh + sandbox-vs-prod app management before the credit-leadership review. Real connector ships in v2 with the same router contract so the v1 stub can be dropped in place.

## Non-Goals (v1 stub)

- Real OAuth handshake against Intuit (`https://appcenter.intuit.com/connect/oauth2`).
- Token storage / refresh.
- Chart of Accounts → RMA template mapping.
- Multi-realm support (one QBO realm per borrower).
- Periodic background sync.

All of the above are explicit v2 work.

## User Flow (v1 stub)

1. Analyst opens ExtractionPanel on a spread with at least one period.
2. Below the SEC fetcher, a third option appears: a card titled **Pull from QuickBooks Online** with a `Connect QuickBooks` button.
3. Click → modal opens. State 1: "⟳ Authenticating with Intuit…" spinner for 1.4 seconds (mimics OAuth round trip).
4. State 2: "✓ Connected to **Acme Manufacturing Inc (Demo Sandbox)**" with a fiscal-year period picker (defaults to first period).
5. Click `Import Trial Balance` → State 3: "⟳ Pulling Income Statement, Balance Sheet, and Cash Flow…"
6. State 4: success card "✓ Imported **27 line items** from Acme Manufacturing for FY2025." Analyst clicks **Done**, modal closes, spread refreshes.

## Architecture

### Backend module: `app/modules/quickbooks_stub/`

```
app/modules/quickbooks_stub/
├── __init__.py
├── router.py     # GET /quickbooks/sandbox-info, POST .../import
└── service.py    # DEMO_TRIAL_BALANCE constant + import_demo_trial_balance()
```

**Endpoint contract:**
```
GET  /quickbooks/sandbox-info
     → { "company": "Acme Manufacturing Inc (Demo Sandbox)", "source": "demo_sandbox" }

POST /quickbooks/spreads/{spread_id}/periods/{period_id}/import
     → { "company": "...", "fiscal_year": int, "fields_imported": int, "source": "quickbooks_demo" }
     404 → spread or period not found / not owned
```

**The fixture data (`DEMO_TRIAL_BALANCE`):**

A realistic mid-market manufacturer:
- $4.25M revenue
- 32% gross margin (manufacturing-typical)
- ~50 day DSO
- Modest leverage (other_long_term_liabilities $850K)
- Balance sheet ties (assets = liab + equity)

Spans IS / BS / CF — 27 raw line items total. Computed totals (`gross_profit`, `ebitda`, `ebit`, `total_assets`, etc.) are deliberately omitted because the analytics layer derives them.

**Import flow:**
1. Auth + ownership check on spread.
2. Validate period belongs to the spread.
3. For each `(statement, field_key, value)`, upsert into `spread_line_items` with `source = "quickbooks"` and `confidence_score = 1.0` (perfect because direct-system-of-record).

## v2 — Real OAuth Migration Plan

When the real connector ships, only `service.py` needs to change. The router contract stays identical.

### What v2 will need

| Concern | Approach |
|---|---|
| **App registration** | Intuit developer account → register SpreadSense as a QuickBooks app → get client_id + client_secret + sandbox redirect URI |
| **OAuth handshake** | Frontend redirects to `appcenter.intuit.com/connect/oauth2?client_id=...&redirect_uri=...&scope=com.intuit.quickbooks.accounting`. Callback endpoint exchanges the auth code for an access + refresh token. |
| **Token storage** | New table `qb_connections (id, borrower_id, realm_id, access_token, refresh_token, expires_at)`. Encrypt at rest. |
| **Token refresh** | Refresh tokens are valid for 100 days; access tokens for 1 hour. Refresh on each API call if `expires_at < now + 60s`. |
| **Trial balance fetch** | `GET /v3/company/{realmId}/reports/TrialBalance?start_date=...&end_date=...`. Parse the QBO `Report.Rows[].ColData` structure. |
| **Account mapping** | New `qb_account_mappings (qb_account_id, qb_account_name, rma_field_key)` table per realm. Pre-populate using QBO's `AccountType` (e.g. `Income` → revenue side, `OtherCurrentAsset` → BS current). Surface unmapped accounts to the analyst for manual mapping the first time. |
| **Migration touchpoint** | Replace `import_demo_trial_balance` with a function of the same signature. Router and frontend untouched. |

## Frontend

`frontend/src/components/QuickBooksConnect.tsx` — modal with a 4-state phase machine (`idle → authenticating → connected → importing → success | error`). On success, invalidates the analytics + line-items + periods react-query caches so the spread re-renders with imported data immediately.

Mounted in `ExtractionPanel.tsx` as a third sibling between the SEC fetcher and the existing PDF dropzone, with `— OR —` dividers.

## Validated Live (May 5, 2026)

Tested against prod backend: `POST /quickbooks/spreads/5/periods/6/import` → 200, `{fields_imported: 27}`. All 27 line items written; line-items endpoint immediately reflects the new `source = "quickbooks"` rows.

## Risks Accepted (v1)

- **Single fixture company** — every demo shows the same Acme Manufacturing trial balance. Acceptable because the only variance is which fiscal-year period the analyst chooses.
- **Pure stub** — if a credit leader probes "show me the actual data flow," answer honestly: *"This is the demo for the click flow. Real OAuth ships next month with the same backend contract."*
- **No undo** — once imported, the only way to remove the values is to PUT them back to `null` or delete the period.

## Risks Deferred to v2 OAuth Implementation

- Cross-realm token isolation (one bank user might have access to multiple borrower QBO realms).
- Webhook subscription (so we know when the borrower updates their QBO).
- Period boundary handling (fiscal-year vs calendar-year vs custom month-end).
- Subaccounts / class tracking / department dimensions.
