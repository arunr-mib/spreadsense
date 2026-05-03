# SpreadSense — A Plain-English Walkthrough

**For:** Anyone curious about what SpreadSense actually does — credit officers, bankers, prospective users, family members trying to understand what you've been building.
**Reading time:** 5 minutes.
**No jargon.** Where a banking term is unavoidable, it's explained on first use.

---

## What problem does SpreadSense solve?

Every commercial bank loan starts with the same boring chore.

A business applies for a loan. The bank's analyst gets a stack of the company's financial statements — usually three documents, often as PDFs:

1. **Income Statement** — what the company earned and spent
2. **Balance Sheet** — what it owns and owes
3. **Cash Flow Statement** — where its cash actually came from and went

The analyst then types every number from those PDFs into a spreadsheet. Just typing. Hundreds of numbers, line by line, for two or three years of history. This process is called **spreading**, and at most banks it takes 2 to 4 hours per loan.

It's tedious, error-prone, and easy to outsource to AI. That's what SpreadSense does.

---

## The 30-second pitch

> Upload the company's PDF. Wait 30 seconds. Review the AI's extracted numbers (color-coded by how confident the AI is). Click confirm. The numbers are now in your spreadsheet.

That's it. What used to take 4 hours takes 4 minutes.

---

## How it works, end to end

### Step 1: Upload
You drag the borrower's annual report PDF into a panel on screen. The system accepts it immediately and starts processing in the background — you don't sit and wait for a single big "Submit" button.

### Step 2: Watch the progress bar
A progress strip walks through five phases live:
- **Uploading** the file
- **Parsing** the PDF text
- Extracting the **Income Statement**
- Extracting the **Balance Sheet**
- Extracting the **Cash Flow Statement**

Each phase ticks off in real time. If anything goes wrong (e.g. the PDF is just a scanned image with no readable text), you get a clear error within seconds — not silent failure 5 minutes later.

### Step 3: Review the AI's work
Once extraction finishes, you see a table of every line item the AI pulled out. Each row is color-coded:

- **Green (HIGH confidence)** — the AI is sure. Just looks right. Skip past these.
- **Yellow (MED confidence)** — the AI found something but isn't certain. The number is pre-filled in an editable box; glance and adjust if needed.
- **Red (LOW confidence)** — the AI struggled. The box is empty and waiting for you. The "Confirm" button is grayed out until you fill these in.

The whole table is sorted with red rows on top, so you focus your attention exactly where it's needed. No hunting.

### Step 4: Confirm
One click writes everything — both your manual entries and the AI's extracted values — into the actual spread grid. Subtotals (gross profit, EBITDA, total assets, etc.) compute automatically. Ratios (debt service coverage, leverage, liquidity) are now ready for the credit memo.

---

## What makes the AI part actually work

The hard part isn't "ask Claude to read the PDF." The hard part is making it reliably find the right numbers in a 150-page filing without going off the rails.

A few things SpreadSense does behind the scenes that you'd never notice as a user:

- **Smart slicing.** A typical SEC 10-K filing is ~400,000 characters of text. The actual financial statements live around character 270,000 — page 110 or so. SpreadSense automatically locates "Consolidated Balance Sheet" in the document and sends only the surrounding 100,000 characters to the AI. This makes the AI faster, cheaper, and more accurate (it doesn't get distracted by 80 pages of risk factors).

- **Field labels in the prompt.** The AI doesn't see "extract `cost_of_goods_sold`" — it sees "extract `cost_of_goods_sold` (Cost of Goods Sold), which on a SaaS 10-K typically appears as 'Cost of revenues'." This contextual hint dramatically improves how reliably the AI maps document terminology to your bank's RMA template.

- **Honest uncertainty.** The AI returns a confidence score with every number. SpreadSense surfaces that directly to the analyst as the green/yellow/red color coding — instead of pretending the AI is always right.

- **Refusal over hallucination.** If the AI can't find a field, it returns `null` with low confidence — not a made-up number. Better to ask a human than to invent a balance sheet figure.

---

## What it looks like in practice

We tested SpreadSense against DocuSign's actual 2026 annual filing — a real 157-page SEC 10-K. Here's what the AI extracted:

| Statement | Lines extracted | Confidence on extracted lines |
|---|---|---|
| Income Statement | 6 of 7 | Mostly HIGH (95%) |
| Balance Sheet | 10 of 13 | Mostly HIGH (90-95%) |
| Cash Flow | 7 of 13 | Mix of HIGH and MED |

The lines that came back empty (inventory, dividends, etc.) are correct — DocuSign as a SaaS company genuinely doesn't have those. The AI flagged them as "I'm 90% confident this field doesn't exist in this document," which is the right answer.

Total extraction time: under 30 seconds. An analyst's review of the 9 yellow/red rows takes maybe 2 minutes. Total spread time: **~3 minutes** instead of 4 hours.

---

## Where SpreadSense fits in the analyst's day

A typical credit deal in this product looks like:

1. **Borrower setup** (1 min) — Add the company name, fiscal year-end, basic identifiers.
2. **Spread creation** (30 sec) — Open a spread for this deal.
3. **Per-period extraction** (3 min × number of years) — Upload each year's PDF, review, confirm.
4. **Ratio review** (auto) — Liquidity, leverage, coverage ratios compute themselves the moment numbers are entered. Breach alerts appear if any threshold is crossed.
5. **Narrative generation** (30 sec) — Click "Generate" — the AI writes a draft credit memo narrative using the spread numbers + computed ratios as context.
6. **Edit + export** (10 min) — Analyst polishes the narrative, marks the deal "completed", exports a PDF credit memo.

The whole loop, for a single-period deal, is roughly **15 minutes from PDF upload to committee-ready memo PDF**.

---

## What it deliberately does NOT do (yet)

- **It doesn't replace the analyst.** Every extraction goes through human confirmation. Every narrative is editable. The AI is a fast first draft, not the final word.
- **It doesn't approve loans.** Decisioning stays with credit committees.
- **It doesn't store sensitive PDFs long-term.** Files are processed in memory; only the extracted numbers and analyst-confirmed values persist.
- **It doesn't pretend to know everything.** If the AI is uncertain, it says so loudly via the confidence color. If the document is unreadable (e.g. a scanned image), it fails fast with a clear error.
- **It doesn't connect to your loan origination system yet.** That's on the GA roadmap.

---

## Who it's built for

- **Credit Analyst (the daily user).** Spends most of their time spreading and writing memos. SpreadSense compresses both.
- **Senior Credit Analyst / Credit Officer.** Reviews and approves analyst work. Gets a portfolio dashboard with breach alerts and pending-review queues.
- **Bank Administrator / IT.** Cares about deployment, audit logs, and access control. SpreadSense runs as a standard web app — frontend on Vercel, backend on Railway, database on Neon-managed Postgres. No infrastructure to maintain.

---

## Where to see it

- **Live demo:** https://spreadsense.vercel.app
- **Source code:** https://github.com/arunr-mib/spreadsense (private)
- **Full PRD:** [`docs/SpreadSense-AI-PRD.md`](./SpreadSense-AI-PRD.md)
- **Extraction architecture deep-dive:** [`docs/superpowers/specs/2026-04-19-extraction-upload-confidence-design.md`](./superpowers/specs/2026-04-19-extraction-upload-confidence-design.md)

---

## TL;DR

SpreadSense turns a 4-hour PDF-typing chore into a 4-minute review-and-click. It uses Anthropic's Claude API to read financial statements, returns confidence scores so analysts know where to focus, and writes the cleaned-up numbers into a structured spreadsheet ready for ratio analysis and credit memo generation.

The AI does the typing. The human does the judgment. That's the whole product.
