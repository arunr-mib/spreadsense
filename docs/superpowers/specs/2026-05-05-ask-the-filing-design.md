# Ask-the-Filing — Design Spec

**Status:** Shipped May 5, 2026
**Owner:** SpreadSense
**Related PRD:** §7.10, F-42 to F-46

## Goal

Let the analyst ask any free-text question about a borrower's filing — risk factors, debt maturity, related-party transactions, MD&A liquidity language, segment commentary — and get an answer grounded strictly in the source document with a section-level citation. Closes the gap that QuikSpread structurally cannot fill: their pipeline reads tables, not prose.

## Non-Goals (v1)

- Multi-turn chat / conversation history.
- Highlighting answer text inside the source PDF.
- Cross-document Q&A (questions about industry, peers, or other borrowers).
- Persistence of question-answer pairs.
- Streaming answers.

## Architecture

### Storage change — `extraction_jobs.extracted_text`

Migration `0002_add_extracted_text` adds a nullable `TEXT` column to the existing `extraction_jobs` table. After every successful extraction, `run_extraction` persists the full extracted plain-text (capped at 2 MB) alongside the structured `results` JSON. This makes the source available for downstream Q&A without re-parsing the original file.

### Backend module: `app/modules/ask_filing/`

```
app/modules/ask_filing/
├── __init__.py
├── router.py     # POST /spreads/{id}/ask
├── service.py    # Pulls latest text → calls Claude → parses
└── schemas.py    # AskRequest, AskResponse
```

**Endpoint contract:**
```
POST /spreads/{spread_id}/ask
Body: { "question": string (3-500 chars) }
Auth: required
200 → { answer: string, source_hint: string|null, filename: string, answered_at: ISO8601 }
404 → spread not found / not owned
422 → no extraction with extracted_text exists for the spread
502 → empty / unparseable model output
```

**Service flow:**
1. Auth + ownership.
2. `_latest_text_job` — most recent `extraction_jobs` row for the spread with non-null `extracted_text` and status in (`ready`, `confirmed`).
3. Truncate text to `MAX_TEXT_CHARS = 600,000` (~150K tokens, well within Sonnet's window).
4. `_build_prompt` — instruction-style prompt that:
   - Names the source filename so Claude knows what document it's reading.
   - Forbids prior knowledge / speculation.
   - Constrains length (2–5 sentences unless the question demands more).
   - Demands plain-text response with a trailing `Source: ...` line — no JSON, no fences.
5. `_claude_generate` — `claude-sonnet-4-5`, max_tokens 1024.
6. `_parse_response` — extracts the trailing `Source:` line if present and treats everything before it as the answer. Falls back to JSON parsing for backward compatibility with an earlier prompt revision.

### Why plain text instead of JSON

The first ship attempt asked Claude to return JSON `{answer, source_hint}`. Three of four demo questions failed JSON parse — model emitted text with embedded quotes and newlines that broke `json.loads`. Switching to "answer paragraph + final `Source: ...` line" eliminated brittleness without losing structure. Code retains JSON parsing as a fallback so in-flight requests during the deploy window were not broken.

### Frontend: `frontend/src/components/AskFiling.tsx`

- Mounted on the KPIs tab below `VarianceCommentary`.
- Single-line input + Ask button + 4 default suggested questions (rendered as pill buttons that submit on click):
  - "What are the top 3 risk factors?"
  - "Summarize the debt maturity schedule."
  - "Are there any material related-party transactions?"
  - "What does management say about liquidity in the MD&A?"
- Result card shows the source filename, answer body (whitespace preserved), and the `📍 Source:` hint when present.
- "Ask another question" link clears the result and the input.

## Model & Latency

- **Model:** `claude-sonnet-4-5` (verified ~6–12s per question on a 600K-char DocuSign 10-K).
- **Why Sonnet:** strong reading comprehension, fast enough for a Q&A loop, much cheaper than Opus per call.
- **Cap on document size:** 600K chars (~150K tokens). DocuSign 10-K landed at 392K, MSFT 10-K at 392K — both fit comfortably.

## Source-Hint Pattern

The prompt instructs Claude to end every answer with `Source: <section>`, e.g.:
- `Source: Item 1A — Risk Factors`
- `Source: Note 8 — Long-term Debt`
- `Source: MD&A — Liquidity and Capital Resources`
- `Source: not specifically located`

The parser strips that line off the answer and surfaces it in the UI as a small purple `📍` badge. This gives the analyst a verifiable pointer without the engineering cost of a real citation system.

## Validated Live (May 5, 2026)

All 4 demo questions returned production-quality answers from the actual DocuSign FY2026 10-K:

| Question | Source hint returned |
|---|---|
| Top 3 risk factors | Item 1A — Risk Factors |
| Debt maturity schedule | Note 8 — Debt (pages 84-85) |
| Material related-party transactions | Item 13 + Note 1 |
| MD&A liquidity | MD&A — Liquidity and Capital Resources |

The debt-schedule answer correctly identified extinguished 2023/2024 convertible notes and the new $750M revolving credit facility maturing May 2030. None of these answers required Claude to reason from external knowledge — they were all in the document text.

## Error Handling

| Condition | HTTP | UI message |
|---|---|---|
| No extraction yet | 422 | "No extracted document found for this spread. Upload a filing first (PDF, SEC fetch, or QuickBooks)." |
| Empty model output | 502 | "The answer was empty. Try rephrasing your question." |
| Network / unknown | (client) | "Question failed — try again." |

## Testing

- Manual smoke verified live on prod against DocuSign 10-K (4/4 questions pass).
- Unit tests deferred (parser is small and exercised by the integration smoke).

## Risks Accepted

- **No citation into source PDF.** Source-hint is the model's claim, not a verified pointer. Acceptable for v1; v2 candidate is char-offset citations.
- **Each call costs ~$0.05–0.15 depending on document size.** Acceptable at pilot scale.
- **2 MB text cap** on `extracted_text`. Larger filings (rare — exceptions might be financial-services 10-Ks at 200+ pages) will be silently truncated.
