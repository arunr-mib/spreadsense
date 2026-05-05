# Variance Commentary — Design Spec

**Status:** Shipped May 5, 2026
**Owner:** SpreadSense
**Related PRD:** §7.9, F-37 to F-41

## Goal

When a spread has at least two periods of line-item data, give the analyst a one-click way to surface the most material period-over-period changes as a credit-committee-grade narrative — quantified, skeptical, and ending with a forward-looking watchpoint. Replaces the 30–60 minutes a junior analyst would otherwise spend writing the first pass of variance commentary in a credit memo.

## Non-Goals (v1)

- Multi-period (>2) trend analysis. Always compares the latest two periods with data.
- Persistence / version history of generated commentary.
- Citations into specific line-item rows or footnotes.
- Editable / regenerable bullets in place — analyst can re-run the whole thing only.
- Configurable tone, length, or audience (analyst / committee / investor).

## User Flow

1. Analyst opens a spread with ≥2 confirmed periods, switches to the **KPIs** tab.
2. The "AI Variance Commentary" card sits at the top with a button: `✨ Explain changes`.
3. Click → button shows `⟳ Analyzing…` and a hint "typically 10–15 seconds."
4. After ~12s, 4–6 bullets render. Each bullet has a colored category label (revenue / margins / liquidity / leverage / working_capital / watch).
5. The final bullet always carries the `watch` category and identifies a forward-looking concern for the next reporting period.
6. A `↻ Regenerate` button replaces `✨ Explain changes` so the analyst can rerun.

## Architecture

### Backend module: `app/modules/variance_commentary/`

```
app/modules/variance_commentary/
├── __init__.py
├── router.py     # POST /spreads/{id}/variance-commentary
├── service.py    # Orchestrates: load periods → format prompt → call Claude → parse
└── schemas.py    # VarianceBullet, VarianceCommentaryResponse
```

**Endpoint contract:**
```
POST /spreads/{spread_id}/variance-commentary
Auth: required (existing JWT)
200 → { bullets: VarianceBullet[], periods_analyzed: string[], generated_at: ISO8601 }
404 → spread not found / not owned
422 → fewer than 2 periods with line-item data
502 → Claude returned malformed JSON
```

**Service flow:**
1. `_get_spread` — auth + ownership check.
2. `_load_periods_with_data` — pulls all periods with at least one line item, ordered by `fiscal_year` ascending. Selects the last two.
3. `_format_period_block` — formats each period as `Fiscal Year YYYY:\n  IS:\n    field_key: value\n  BS:\n  ...`.
4. `_build_prompt` — combines borrower name, deal name, and the two formatted blocks with a tightly-worded system prompt.
5. `_claude_generate` — `claude-sonnet-4-5`, max_tokens 2048, single user message.
6. `_parse_response` — strips code fences if present, validates each bullet has a non-empty `text` and a category from the allowed set (falls back to `watch` if unknown), returns the typed list.

**System prompt (excerpt):**
> You are a senior commercial credit analyst preparing brief notes for a credit committee. Identify the 4 to 6 most material variances between the two periods. Be specific with numbers (cite actual values, percent change). Be skeptical — surface what could be hidden under the surface. End with exactly one forward-looking "Watch:" bullet on what could matter for credit risk in the next quarter.

The prompt asks Claude to return JSON only with `bullets[].text` and `bullets[].category`. Code-fence wrapping is tolerated.

### Frontend: `frontend/src/components/VarianceCommentary.tsx`

- React-Query mutation calling `/spreads/{id}/variance-commentary`.
- State machine: idle → loading → success / error.
- Only enabled when `analytics.periods.length >= 2` (queries the existing `/spreads/{id}/analytics` endpoint to check).
- Mounted on the KPIs tab in `SpreadDetailPage` directly above `KpiSection`.
- Each bullet rendered as `<li>` with a category pill (color-coded background + text).

## Model & Latency

- **Model:** `claude-sonnet-4-5` (verified during ship: ~12s end-to-end on a 30-line-item × 2-period prompt).
- **Why Sonnet:** Opus added ~5s with no observable quality lift; Haiku risks losing the skeptical-analyst voice on multi-step ratio reasoning.
- **Why not stream:** UI complexity not worth the ~5s perceived-latency win for a 12s call. v2 candidate.

## Categories

Six allowed values; the prompt instructs Claude to use them. Unknown categories fall back to `watch`.

| Category | UI label | Color |
|---|---|---|
| `revenue` | Revenue | sky |
| `margins` | Margins | amber |
| `liquidity` | Liquidity | emerald |
| `leverage` | Leverage | rose |
| `working_capital` | Working Capital | violet |
| `watch` | Watch | yellow |

## Error Handling

| Condition | HTTP | UI message |
|---|---|---|
| Spread has 0–1 periods with data | 422 | "Add a second fiscal year period to enable variance commentary." |
| Claude returns invalid JSON | 502 | Generic "Generation failed — try again." |
| Claude returns empty bullets | 502 | Generic |
| Network error | (client) | "Generation failed — try again." |

## Testing

- 7 unit tests in `backend/tests/test_variance_commentary.py`:
  - 5 parser tests (code fences, unknown category fallback, blank skip, invalid JSON, empty bullets).
  - 1 happy-path test mocking Claude.
  - 1 422-on-one-period test.
- Frontend tests deferred (state machine is small and visually verified).

## Validated Live (May 5, 2026)

Tested on DocuSign FY2024 (real 10-K extraction) vs FY2025 (synthetic stress scenario seeded for demo). Sample output captured tighter than expected — bullet on AR-vs-revenue divergence calculated DSO 58→76 days; bullet on interest coverage flagged 158x → 6.4x. Both are exactly the language a credit committee speaks.

## Risks Accepted

- **Bullets aren't traceable to specific line-item rows.** v2 could number-tag claims to source cells.
- **No persistence.** Reload = regenerate. v2 could store last commentary per spread/period combo.
- **Sonnet calls cost real $.** Each generation is ~$0.05–0.10. Acceptable at expected demo+pilot volumes.
