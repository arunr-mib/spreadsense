# SpreadSense AI — Product Requirements Document

**Document Status:** Draft v1.4 — May 5, 2026
**Date:** May 5, 2026 (originally April 21, 2026)
**v1.4 changelog:** Adds AI variance commentary, Ask-the-Filing free-text Q&A, QuickBooks Online connector (demo stub for v1; real OAuth in v2), Excel export, and Reopen workflow transition. All five shipped to production prior to credit-leadership review.
**Owner:** Arun Rajendiran
**Reviewers:** Credit Technology, Risk Management, Engineering
**Confidentiality:** Internal — Not for Distribution
**Live URL:** https://spreadsense.vercel.app
**Source:** https://github.com/arunr-mib/spreadsense (private)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Background & Motivation](#2-background--motivation)
3. [Problem Statement](#3-problem-statement)
4. [User Personas](#4-user-personas)
5. [Goals & Non-Goals](#5-goals--non-goals)
6. [User Stories](#6-user-stories)
7. [Functional Requirements](#7-functional-requirements)
8. [AI/ML System Requirements](#8-aiml-system-requirements)
9. [Technical Architecture](#9-technical-architecture)
10. [Data Requirements](#10-data-requirements)
11. [Security & Compliance](#11-security--compliance)
12. [Success Metrics & OKRs](#12-success-metrics--okrs)
13. [Risks & Mitigations](#13-risks--mitigations)
14. [Launch Plan & Milestones](#14-launch-plan--milestones)
15. [Open Questions](#15-open-questions)
16. [Appendix](#16-appendix)

---

## 1. Executive Summary

**SpreadSense AI** is an AI-native financial spreading platform designed for commercial bank credit analysts. It transforms the manually intensive process of spreading borrower financial statements into a structured, AI-assisted workflow that produces committee-ready credit memos in minutes rather than hours.

The platform combines Claude AI's document extraction capabilities with RMA (Risk Management Association) and UCA (Uniform Credit Analysis) Cash Flow standards to automatically parse PDFs, populate financial statement spreads, calculate covenant ratios, flag threshold breaches, generate narrative summaries, and export professional credit memos — all within a single, role-aware web application.

**Key value proposition:** A credit analyst who previously spent 3–4 hours manually keying numbers from a borrower's financial statements can complete a full spread with AI-generated narrative in under 30 minutes, with senior analysts able to review a portfolio dashboard of all active deals in one view.

---

## 2. Background & Motivation

### Industry Context

Commercial lending relies on "spreading" — the process of extracting, normalizing, and analyzing borrower financial data across multiple periods to assess creditworthiness. Analysts manually transcribe income statements, balance sheets, and cash flow statements from PDFs or paper documents into spreadsheet templates, then calculate ratios, compare to covenants, and write narrative summaries for credit committee presentation.

This process is:
- **Time-intensive**: 3–6 hours per spread for complex borrowers with multiple years of data
- **Error-prone**: Manual data entry introduces transcription errors that can misrepresent creditworthiness
- **Inconsistent**: Different analysts follow different formatting and narrative conventions, making portfolio-level comparison difficult
- **Unscalable**: Portfolio growth requires proportional analyst headcount growth

### AI Opportunity

Large language models with vision and document understanding capabilities (e.g., Claude 3.x) are now capable of accurately extracting structured financial data from PDFs, including:
- Identifying line items across varying statement formats (GAAP, tax basis, management prepared)
- Normalizing non-standard line item names to canonical schema
- Inferring missing period data from multi-year comparative statements
- Generating coherent, standardized credit narrative prose

This enables a human-in-the-loop workflow where AI performs the mechanical extraction and first-pass narrative, while the analyst reviews, corrects, and approves — shifting analyst time from data entry to credit judgment.

---

## 3. Problem Statement

### Primary Problem

**Commercial credit analysts at small-to-midsize banks and credit unions spend 60–80% of their spreading time on mechanical data transcription tasks that add no analytical value.** This leaves insufficient time for actual credit analysis, causes deal velocity to suffer, and creates burnout among experienced analysts.

### Secondary Problems

1. **Inconsistency at scale**: Without a structured platform, each analyst's spread looks different, making it impossible for senior analysts and portfolio managers to quickly compare deals or monitor portfolio health in aggregate.
2. **Knowledge loss**: Tribal knowledge about borrower trends and covenant watch items lives in analyst heads or email threads rather than a searchable, structured system.
3. **Credit memo bottleneck**: Formatting a committee-ready credit memo from a completed spread is a separate, multi-hour task — often done in Word or PowerPoint — creating a disconnect between the analysis and the deliverable.
4. **No portfolio visibility**: Senior credit officers lack a real-time view of pipeline status, covenant breach rates, and emerging risk concentrations across their portfolio.

### Who is affected

- **Credit Analysts** (primary): 2–6 hours saved per spread; reduced errors; consistent output format
- **Senior Credit Officers / Portfolio Managers**: Real-time portfolio dashboard; standardized memos for committee review
- **Compliance / Risk**: Auditable spread history; consistent ratio methodology; AI confidence scoring

---

## 4. User Personas

### Persona 1: Jordan — Credit Analyst

- **Role:** Junior-to-mid credit analyst, 1–5 years experience
- **Context:** Handles 15–25 active spreads at any time; primary data entry responsibility
- **Pain points:** Spends most of working day keying numbers; stressed about errors; memo formatting feels like busy work
- **Goals:** Complete accurate spreads quickly; learn from AI suggestions; produce professional memos without design work
- **Technical comfort:** Moderate — comfortable with Excel, SaaS tools; not a developer
- **Key workflows:** Upload PDF → review AI extraction → adjust line items → view ratios → export memo

### Persona 2: Alex — Senior Credit Analyst / Credit Officer

- **Role:** 8+ years experience; reviews analyst work; presents to credit committee
- **Context:** Oversees 5–10 analysts; needs portfolio-level view; accountable for credit quality
- **Pain points:** Must review each spread individually in Excel; no aggregate dashboard; inconsistent memo formats from different analysts
- **Goals:** Trust AI-assisted spreads; quickly identify portfolio risk; standardize committee output
- **Technical comfort:** High — power Excel user; skeptical of black-box AI; wants explainability
- **Key workflows:** Dashboard review → drill into breaches → review narratives → approve memos

### Persona 3: Sam — Bank Administrator / IT

- **Role:** Manages user access, system configuration
- **Context:** Responsible for onboarding new analysts; managing user roles; audit trail
- **Pain points:** No self-service user management; no audit logs
- **Goals:** Secure role-based access; easy onboarding; compliance-friendly audit trail
- **Technical comfort:** High
- **Key workflows:** Create users → assign roles → view activity logs

---

## 5. Goals & Non-Goals

### Goals

**G1 — AI-Assisted Extraction:** Reduce time-to-complete-spread by ≥60% versus manual entry baseline through AI-powered PDF extraction with human review/correction.

**G2 — Standards Compliance:** Implement RMA and UCA Cash Flow methodology for all ratio calculations, ensuring industry-standard analysis that satisfies bank examination requirements.

**G3 — End-to-End Workflow:** Cover the full analyst workflow in a single platform: upload → spread → analyze → narrate → memo → export, eliminating the need for external tools.

**G4 — Portfolio Intelligence:** Give senior analysts and admins a real-time portfolio view with breach alerts, pipeline status, and deal velocity metrics.

**G5 — Consistency at Scale:** Ensure all spreads and memos produced by any analyst follow the same format, methodology, and presentation standards.

**G6 — Explainable AI:** Every AI output (extracted line item, ratio calculation, narrative claim) must be traceable to source data, building analyst trust and satisfying audit requirements.

### Non-Goals (v1)

- **Core banking integration**: No direct connection to loan origination systems (LOS), core banking platforms, or data warehouses in v1. CSV/PDF import only.
- **Automated decisioning**: SpreadSense AI does not make credit decisions. It provides analysis to support human judgment.
- **Consumer / retail lending**: v1 targets commercial borrowers only. No personal financial statement spreading.
- **Mobile app**: Web-only in v1; no native iOS/Android.
- **Multi-language document support**: English-language financial statements only in v1.
- **Real-time market data**: No integration with market data feeds (e.g., Bloomberg) in v1.

---

## 6. User Stories

### Extraction & Spreading

| ID | As a... | I want to... | So that... |
|----|---------|-------------|------------|
| US-01 | Credit Analyst | Upload a borrower's tax return or CPA-prepared statements PDF | The system extracts financial line items automatically |
| US-02 | Credit Analyst | Review AI-extracted line items with confidence scores | I can quickly identify and correct uncertain extractions |
| US-03 | Credit Analyst | Map non-standard line item names to canonical schema | The spread follows RMA/UCA methodology |
| US-04 | Credit Analyst | Enter multiple fiscal years in a single spread | I can analyze trends across periods |
| US-05 | Credit Analyst | Save partial spreads and return later | I don't lose work if interrupted |

### Analysis & Ratios

| ID | As a... | I want to... | So that... |
|----|---------|-------------|------------|
| US-06 | Credit Analyst | See auto-calculated DSCR, leverage, liquidity, and coverage ratios | I don't have to manually compute formulas |
| US-07 | Credit Analyst | See which ratios breach loan covenant thresholds | I can immediately identify compliance issues |
| US-08 | Credit Analyst | Configure custom threshold values per deal | Different loan structures have different covenants |
| US-09 | Sr. Analyst | See ratios trending across multiple periods | I can identify deteriorating credit quality over time |

### Narrative & Memo

| ID | As a... | I want to... | So that... |
|----|---------|-------------|------------|
| US-10 | Credit Analyst | Generate an AI narrative summary of the spread | I have a starting point I can edit rather than writing from scratch |
| US-11 | Credit Analyst | Edit the AI narrative before saving | I retain control over the final written analysis |
| US-12 | Credit Analyst | Export a formatted PDF credit memo | I can present to credit committee without reformatting in Word |
| US-13 | Credit Analyst | Attach recommendation, risk rating, and facility details to the memo | The memo is complete and committee-ready |

### Portfolio & Admin

| ID | As a... | I want to... | So that... |
|----|---------|-------------|------------|
| US-14 | Sr. Analyst | View a dashboard of all deals with status, analyst, and breach counts | I can monitor portfolio health at a glance |
| US-15 | Sr. Analyst | Filter dashboard by status, analyst, or breach severity | I can prioritize my review queue |
| US-16 | Admin | Create and manage user accounts with role assignments | I can onboard analysts and control access |
| US-17 | Admin | View an audit log of all spread edits and AI calls | I can satisfy examination requirements |

---

## 7. Functional Requirements

### 7.1 Borrower Management

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| F-01 | System shall maintain a borrower record with name, industry (NAICS/SIC), fiscal year end, and creation metadata | P0 |
| F-02 | Borrowers shall be searchable by name and filterable by industry | P1 |
| F-03 | A borrower overview page shall show all associated spreads with status and last-modified date | P0 |
| F-04 | Borrower records shall be editable by analysts with appropriate role | P1 |

### 7.2 Spread Management

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| F-05 | A spread shall be associated with exactly one borrower and have a deal name, loan type, and status | P0 |
| F-06 | Spread status workflow: `draft` → `in_review` → `approved` | P0 |
| F-07 | System shall support Income Statement, Balance Sheet, and Cash Flow statement types per period | P0 |
| F-08 | Each period shall record fiscal year, period type (annual/interim), and basis (GAAP/Tax/Management) | P0 |
| F-09 | Line items shall support canonical schema mapping for RMA normalization | P0 |
| F-10 | Spreads shall display multiple periods side-by-side for trend analysis | P1 |

### 7.3 AI Extraction

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| F-11 | System shall accept PDF uploads of financial statements (max 50MB) | P0 |
| F-12 | AI extraction shall return line items with values, confidence scores, and source page references | P0 |
| F-13 | Analysts shall be able to accept, reject, or override any AI-extracted value | P0 |
| F-14 | System shall store the original AI extraction alongside analyst-corrected values for audit | P1 |
| F-15 | AI extraction shall complete within 60 seconds for a 20-page PDF on standard hardware | P1 |

### 7.4 Analytics & Ratios

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| F-16 | System shall calculate DSCR, leverage ratio, current ratio, quick ratio, and operating cash flow coverage | P0 |
| F-17 | Ratios shall be recalculated automatically on any line item change | P0 |
| F-18 | System shall flag ratios that breach configurable thresholds as `breach` or `near_threshold` | P0 |
| F-19 | Default thresholds shall follow RMA industry medians; per-deal overrides shall be supported | P1 |
| F-20 | Analytics shall be exposed via a KPI strip on the spread detail page | P0 |

### 7.5 Narrative Generation

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| F-21 | System shall generate an AI narrative summarizing spread financials, ratio performance, and breach alerts | P0 |
| F-22 | Narrative shall be editable by the analyst | P0 |
| F-23 | System shall version-control narrative edits and expose edit history | P1 |
| F-24 | Narrative generation shall incorporate prior analyst edits as context for regeneration | P1 |

### 7.6 Credit Memo

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| F-25 | System shall generate a formatted PDF credit memo combining spread data, ratios, narrative, and analyst-entered metadata | P0 |
| F-26 | Memo metadata shall include: recommendation, risk rating, facility type/amount/purpose/maturity, collateral | P0 |
| F-27 | PDF export shall use consistent bank-branded template | P1 |
| F-28 | Memo shall include a generated timestamp and analyst attribution | P0 |

### 7.7 Portfolio Dashboard

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| F-29 | Dashboard shall display pipeline status counts (draft, in_review, approved) | P0 |
| F-30 | Dashboard shall surface active breach alerts across all spreads with borrower and ratio context | P0 |
| F-31 | Dashboard shall display an enriched deal table with borrower, analyst, status, period count, and breach count | P0 |
| F-32 | Dashboard shall be restricted to `sr_credit_analyst` and `admin` roles | P0 |

### 7.8 User & Access Management

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| F-33 | System shall support three roles: `credit_analyst`, `sr_credit_analyst`, `admin` | P0 |
| F-34 | Authentication shall use JWT-based sessions | P0 |
| F-35 | Analysts shall only see their own spreads; sr_analysts and admins see all | P0 |
| F-36 | Admin role shall manage user accounts and role assignments | P1 |
| F-36a | Workflow shall support a `completed → draft` (Reopen) transition for the owning analyst (to fix their own work) and reviewers (to send back for changes) | P0 — shipped May 5, 2026 |

### 7.9 Variance Commentary (AI)

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| F-37 | When a spread has at least two periods with line-item data, system shall offer a "Explain changes" action that returns AI-generated variance commentary | P0 — shipped May 5, 2026 |
| F-38 | Commentary shall be returned as 4–6 structured bullets, each tagged with a category (revenue / margins / liquidity / leverage / working_capital / watch) | P0 |
| F-39 | The final bullet shall always carry the `watch` category and identify a forward-looking credit-risk concern for the next reporting period | P0 |
| F-40 | Commentary shall be regeneratable with a single click; results are stateless and not persisted | P1 |
| F-41 | If fewer than two periods have line-item data, the UI shall surface "add a second fiscal year period" guidance instead of the action | P0 |

### 7.10 Ask-the-Filing (AI Q&A)

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| F-42 | System shall persist the full extracted plain-text of every confirmed extraction (column `extraction_jobs.extracted_text`, capped at 2 MB) for downstream Q&A use | P0 — shipped May 5, 2026 |
| F-43 | System shall provide a per-spread free-text Q&A endpoint that answers questions strictly grounded in the most-recent extracted document for that spread | P0 |
| F-44 | Each answer shall include a "source hint" identifying the section of the source document that supports it (e.g. "Item 1A — Risk Factors", "Note 8 — Debt"); when not locatable, the system shall say so explicitly | P0 |
| F-45 | The model shall refuse to answer questions that cannot be supported from the extracted text; it shall not draw on external or pretrained knowledge for borrower-specific facts | P0 |
| F-46 | UI shall offer 4 default suggested questions tuned for credit analysis (risk factors, debt maturity, related-party transactions, MD&A liquidity) | P0 |

### 7.11 Direct Accounting-System Connector — QuickBooks Online (v1: stub)

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| F-47 | System shall offer a "Connect QuickBooks" path inside ExtractionPanel as a third ingestion option alongside PDF upload and SEC fetcher | P0 — stub shipped May 5, 2026 |
| F-48 | v1 stub shall write a fixed, realistic SMB trial balance (27 line items spanning IS / BS / CF) for an "Acme Manufacturing (Demo Sandbox)" entity into the analyst's chosen period | P0 — v1 only |
| F-49 | Imported line items shall be tagged with `source = "quickbooks"` and `confidence_score = 1.0` to distinguish them from PDF-extracted values | P0 |
| F-50 | v2 (target Q3 2026) shall replace the stub with real Intuit OAuth 2.0, sandbox + production app registration, refresh-token storage, and Chart-of-Accounts → RMA-template mapping. Router contract (`POST /quickbooks/spreads/{id}/periods/{p}/import`) is stable across the migration. | P1 — v2 |

### 7.12 Excel Export

| Req ID | Requirement | Priority |
|--------|-------------|----------|
| F-51 | System shall provide a per-spread Excel export endpoint that returns a valid `.xlsx` workbook with one sheet per statement (IS / BS / CF) | P0 — shipped May 5, 2026 |
| F-52 | Each sheet shall render fiscal-year columns side-by-side, accounting number format, total-row highlighting, and a banner with borrower + deal name | P0 |
| F-53 | Filename shall encode borrower and spread ID (e.g. `UAT_Docusign2_Inc_Spread_1.xlsx`) | P0 |
| F-54 | Bank-branded layout (logo, footer, formula cells) is deferred to v2 | P1 — v2 |

---

## 8. AI/ML System Requirements

### 8.1 AI Model Architecture

SpreadSense AI uses a **retrieval-augmented generation (RAG)** approach layered on a large language model (Claude 3.x) for all AI-powered features:

| Feature | AI Approach | Model | Latency Target |
|---------|-------------|-------|----------------|
| PDF extraction | Vision + structured extraction | Claude 3.5 Sonnet (vision) | < 60s / 20-pg PDF |
| Line item normalization | Classification + few-shot | Claude 3.5 Haiku | < 5s |
| Credit narrative generation | Long-context generation | Claude 3.5 Sonnet | < 30s |
| Breach alert summarization | Constrained generation | Claude 3.5 Haiku | < 10s |

### 8.2 Extraction Pipeline

```
[PDF Upload]
     │
     ▼
[PDF → Page Images] (pdf2image, 150 DPI)
     │
     ▼
[Claude Vision: Extract raw line items + values per page]
     ├── Output: [{line_item_raw, value, page_ref, confidence}]
     │
     ▼
[Normalization: Map raw labels → canonical schema]
     ├── Rule-based: exact match dictionary (3,000+ entries)
     ├── AI fallback: Claude few-shot classification for unknowns
     └── Output: [{canonical_label, value, confidence, source_label}]
     │
     ▼
[Analyst Review UI: accept / override / reject per item]
     │
     ▼
[Confirmed Spread Line Items → DB]
```

**Confidence Scoring:**
- `HIGH` (≥0.85): Green — likely correct, no analyst flag required
- `MEDIUM` (0.60–0.84): Yellow — suggest analyst review
- `LOW` (<0.60): Red — require analyst confirmation before saving

### 8.3 Narrative Generation

**Input context provided to model:**
- Borrower name, industry, fiscal year end
- Loan type and purpose
- All spread periods: key IS/BS/CF line items, ratios, breach flags
- Prior analyst-edited narrative (if regenerating)
- Breach alerts with severity and trend direction

**Output specification:**
- 3–5 paragraphs: (1) Company overview, (2) Revenue and profitability, (3) Leverage and liquidity, (4) Cash flow analysis, (5) Risk summary and covenant compliance
- Factual claims must reference specific financial figures from the spread
- Flags: model must not speculate about future performance or include non-spread-derived facts
- Tone: professional credit analysis register (not marketing language)

**Guardrails:**
- System prompt explicitly prohibits hallucination of financial figures
- Post-generation validation: regex checks that all dollar/percentage figures in output appear in source spread data
- Confidence score for each paragraph returned alongside text

### 8.4 Model Evaluation

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Extraction accuracy (numeric values) | ≥95% exact match | Holdout set of 100 manually verified spreads |
| Line item normalization accuracy | ≥92% correct canonical label | Labeled dataset of 5,000 line item names |
| Narrative factual accuracy | ≥98% figures traceable to spread | Automated post-generation validation |
| Extraction latency p95 | ≤60s for 20-page PDF | Production logging |
| Narrative generation latency p95 | ≤30s | Production logging |
| Analyst acceptance rate (extractions) | ≥80% accepted without correction | In-product telemetry |
| Analyst edit rate (narratives) | <40% requiring substantive edits | In-product telemetry |

### 8.5 Prompt Engineering & Version Control

- All system prompts and few-shot examples stored in version-controlled repository
- Prompt changes require A/B testing on holdout set before production deployment
- Prompt versioning tracked in `ai_call_logs` table (`prompt_version` column)
- Regression testing suite of 50 canonical spread examples run on every prompt change

### 8.6 AI Safety & Ethics

**Bias and Fairness:**
- SpreadSense AI performs financial analysis on objective numeric data. Narrative generation must not include language about the borrower's demographic characteristics, geographic region as a proxy for creditworthiness, or any protected class characteristics.
- Quarterly bias audits: review narrative samples for potentially discriminatory language patterns.

**Explainability:**
- Every AI-extracted value links to a source page and bounding box in the original PDF.
- Every narrative claim references the specific financial figure it is based on.
- Analysts cannot submit a spread with AI-generated extractions that have not been reviewed.

**Human in the Loop:**
- AI never approves or recommends approval of credit requests. All decisioning is explicitly human.
- AI output is labeled as AI-generated in all UI surfaces and exported memos.
- Analyst override of any AI output is always available.

**Data Handling:**
- Uploaded PDFs and extracted data are customer-owned and never used for model training without explicit consent.
- AI API calls transmit only the minimum necessary financial data (no PII beyond company name).

---

## 9. Technical Architecture

### 9.1 System Overview

```
┌─────────────────────────────────────────────────┐
│                    Frontend                      │
│  React 18 + TypeScript + Vite + Tailwind CSS    │
│  React Query v5 · React Router v6               │
│  Port 5174 (dev)                                │
└─────────────────────┬───────────────────────────┘
                      │ HTTP/REST
┌─────────────────────▼───────────────────────────┐
│                    Backend                       │
│  Python 3.12 · FastAPI · SQLAlchemy (async)     │
│  Pydantic v2 · Alembic migrations               │
│  Port 8001                                      │
│                                                  │
│  Modules:                                        │
│  ├── auth         JWT validation + user context  │
│  ├── borrowers    Borrower CRUD                  │
│  ├── spreads      Spread + period + line items   │
│  ├── analytics    Ratio calc + breach detection  │
│  ├── narrative    AI narrative generation        │
│  ├── memo         Credit memo meta + PDF export  │
│  └── portfolio    Dashboard aggregation          │
└──────┬─────────────────────────────┬────────────┘
       │                             │
┌──────▼──────┐              ┌───────▼────────┐
│ PostgreSQL  │              │   Claude API   │
│ Port 5432   │              │ (Anthropic)    │
└─────────────┘              └────────────────┘
```

### 9.2 Data Model (Core Entities)

```
users ──< spreads >── borrowers
             │
             ├── spread_periods
             │         └── spread_line_items
             │
             ├── narrative_versions
             │
             └── credit_memo_meta
```

### 9.3 API Design

All endpoints follow RESTful conventions. Key routes:

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/borrowers/` | List / create borrowers |
| GET/PATCH | `/borrowers/{id}` | Get / update borrower |
| GET/POST | `/spreads/` | List / create spreads (filterable by borrower_id) |
| GET/PATCH | `/spreads/{id}` | Get / update spread |
| POST | `/spreads/{id}/extract` | Trigger AI extraction from uploaded PDF |
| GET/POST | `/spreads/{id}/periods` | List / add periods |
| GET | `/spreads/{id}/analytics` | Get calculated ratios + breach alerts |
| GET/POST | `/spreads/{id}/narrative` | Get / regenerate AI narrative |
| GET/PUT | `/spreads/{id}/memo/meta` | Get / upsert memo metadata |
| GET | `/spreads/{id}/memo/pdf` | Export credit memo PDF |
| GET | `/portfolio/summary` | Portfolio dashboard data (role-gated) |

### 9.4 Infrastructure

| Component | v1 (Development) | v1 (Production) |
|-----------|-----------------|-----------------|
| Frontend hosting | Vite dev server | Vercel / Cloudflare Pages |
| Backend hosting | Docker (local) | Railway / Render |
| Database | PostgreSQL 15 (Docker) | Supabase / Neon |
| File storage | Local disk | AWS S3 / Supabase Storage |
| AI API | Anthropic Claude API | Anthropic Claude API |
| Auth | JWT (custom) | Supabase Auth (planned) |
| CI/CD | None (v0) | GitHub Actions |

---

## 10. Data Requirements

### 10.1 Training & Evaluation Data

| Dataset | Source | Size | Use |
|---------|--------|------|-----|
| Financial statement PDFs (labeled) | Internal bank samples (anonymized) | 500+ documents | Extraction accuracy evaluation |
| Line item normalization corpus | RMA taxonomy + internal | 10,000+ entries | Normalization dictionary + fine-tune eval |
| Analyst-corrected spreads | Production (with consent) | Ongoing | Continuous extraction improvement |
| Credit narratives (labeled quality) | Senior analyst review | 200+ narratives | Narrative quality evaluation |

### 10.2 Data Retention

| Data Type | Retention | Justification |
|-----------|-----------|---------------|
| Uploaded PDFs | 7 years | Bank examination requirements |
| Spread line items + ratios | 7 years | Credit file requirements |
| AI extraction logs | 3 years | Model debugging + audit |
| AI call logs (prompt/response) | 1 year | Prompt versioning + compliance |
| Narrative versions | Indefinite | Audit trail |
| User activity logs | 3 years | Compliance |

### 10.3 Data Privacy

- PDFs are encrypted at rest (AES-256) and in transit (TLS 1.3)
- No PII beyond business entity names transmitted to Claude API
- Multi-tenant data isolation via `user_id` on all tables
- Data residency: US-based storage in v1 (international expansion = future consideration)

---

## 11. Security & Compliance

### 11.1 Authentication & Authorization

| Control | Implementation |
|---------|---------------|
| Authentication | JWT with RS256 signing; 1-hour access token, 7-day refresh |
| Authorization | Role-based: `credit_analyst` < `sr_credit_analyst` < `admin` |
| Data isolation | All queries include `user_id` or role-based filter; ORM-level enforcement |
| API gateway | All AI calls proxied through backend; no API keys exposed to frontend |

### 11.2 Compliance Considerations

- **BSA/AML**: SpreadSense AI is an analytical tool and does not perform origination decisions. Customer Due Diligence (CDD) responsibility remains with the institution.
- **Fair Lending (ECOA/FHA)**: AI narratives must not incorporate protected class characteristics. Annual disparate impact analysis recommended.
- **SOC 2 Type II**: Target certification within 12 months of GA launch.
- **Bank Examination Readiness**: All AI interventions logged with prompt version, input hash, and output; examiners can request extraction confidence scores and source document references.

---

## 12. Success Metrics & OKRs

### 12.1 Objective: Dramatically reduce analyst time-to-spread

| Key Result | Baseline | Target (6 months post-launch) | Measurement |
|------------|----------|-------------------------------|-------------|
| KR1: Avg time to complete spread (AI-assisted) | 4h (manual) | ≤1.5h | In-product timing telemetry |
| KR2: AI extraction acceptance rate | N/A | ≥80% | Accepted / total extracted items |
| KR3: Spreads completed per analyst per week | 2–3 | 6–8 | Production DB |

### 12.2 Objective: Improve credit analysis quality and consistency

| Key Result | Baseline | Target (6 months post-launch) | Measurement |
|------------|----------|-------------------------------|-------------|
| KR4: Ratio calculation accuracy | Varies (manual) | 100% (automated) | Automated test suite |
| KR5: Breach detection accuracy | Manual / inconsistent | 100% vs known covenant set | Regression tests |
| KR6: Narrative factual accuracy | N/A | ≥98% | Post-generation validation |

### 12.3 Objective: Achieve product-market fit

| Key Result | Baseline | Target (6 months post-launch) | Measurement |
|------------|----------|-------------------------------|-------------|
| KR7: Weekly active analysts | 0 | ≥10 | Auth logs |
| KR8: NPS score | N/A | ≥40 | Quarterly survey |
| KR9: Spreads per month | 0 | ≥100 | Production DB |
| KR10: Memo PDF exports per month | 0 | ≥50 | Export logs |

---

## 13. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| AI extraction errors cause analyst to trust incorrect data | Medium | High | Confidence score UI; require review before submit; audit trail; holdout accuracy testing |
| Model hallucination in narratives produces incorrect financial figures | Low | High | Post-generation validation regex; figure-to-source-data linkage; analyst review required |
| Claude API rate limits during peak spreading periods | Medium | Medium | Request queue with backoff; caching of extraction results; user-facing status feedback |
| Data breach exposing confidential financial statements | Low | Critical | AES-256 encryption; VPC isolation; regular penetration testing; zero-trust networking |
| Regulatory pushback on AI in credit decisions | Low | High | Explicit human-in-the-loop design; AI never makes or recommends decisions; full audit trail |
| Analyst adoption resistance (change management) | Medium | Medium | Training materials; side-by-side comparison mode; quick wins (extraction speed demo) |
| Claude API pricing increases materially | Low | Medium | Optimize prompt efficiency; implement caching for repeated extractions; evaluate open-source alternatives |
| Financial statement format diversity causes extraction failures | High | Medium | Broad format testing; graceful degradation to manual entry; continuous extraction improvement pipeline |

---

## 14. Launch Plan & Milestones

### Phase 1: Foundation (Completed — Q1 2026)

- [x] Core data model: users, borrowers, spreads, periods, line items
- [x] Authentication (JWT) and role-based access control
- [x] Manual spread entry UI
- [x] Ratio calculation engine (DSCR, leverage, liquidity, coverage)
- [x] Breach detection with configurable thresholds
- [x] Analytics KPI strip in spread detail view

### Phase 2: AI Integration (Completed — Q1/Q2 2026)

- [x] Claude API integration for PDF extraction
- [x] Line item normalization (rule-based + AI fallback)
- [x] AI narrative generation
- [x] Narrative edit and version history
- [x] Credit memo metadata form
- [x] PDF export (WeasyPrint, Jinja2 template)
- [x] Review workflow: status machine (draft→completed→reviewed→exported)
- [x] Audit history log with transition timeline UI
- [x] Status filter tabs on deal dashboard

### Phase 3: Navigation & Portfolio (Completed — Q2 2026)

- [x] Collapsible left sidebar navigation
- [x] Borrower list page with spread counts
- [x] Borrower overview page
- [x] Borrower create/edit forms
- [x] Portfolio dashboard (sr/admin roles)
- [x] Breach alert summary cards
- [x] Enriched deal table with filters

### Phase 4: Production Readiness (In Progress — Q3 2026)

- [ ] Supabase Auth migration (OAuth / SSO)
- [ ] File storage migration to S3/Supabase Storage
- [x] PDF upload UI with real-time per-statement progress tracking (ExtractionPanel — async BackgroundTask pipeline, phase column, 2s polling)
- [x] Extraction confidence score UI (color-coded review queue — HIGH/MED/LOW tiers, inline override inputs, sorted by confidence ascending)
- [x] **First production deployment** (May 3, 2026) — Frontend on Vercel, FastAPI backend on Railway, Postgres on Neon. Public URL: https://spreadsense.vercel.app
- [x] **Real SEC 10-K extraction validated end-to-end** — DocuSign FY2026 10-K (157 pages, 392k chars) yielded 23/33 non-null fields with HIGH confidence in <30 seconds
- [x] **Smart financial-statements section slicing** — Regex-locates the consolidated statements block and sends only the relevant 100k-char window to Claude (~75% token cost reduction vs naive truncation)
- [x] **Image-based PDF guard** — Fast-fails with a clear error when PyMuPDF extracts <200 chars, instead of silently returning all-null
- [x] **Test infrastructure hardening** — Dedicated test database, savepoint-based isolation so application commits don't pollute the test transaction (75/75 tests passing)
- [x] **CI on every push** — GitHub Actions runs backend pytest (with ephemeral Postgres) plus frontend `tsc --noEmit` and production build
- [x] SEC EDGAR fetcher: pull latest 10-K / 10-Q for any public ticker directly inside ExtractionPanel.
- [x] **AI variance commentary** (May 5, 2026) — `POST /spreads/{id}/variance-commentary` endpoint and Analytics-tab card. Claude Sonnet 4.5 reads two periods of structured line items + ratios, returns 4–6 categorized bullets (revenue / margins / liquidity / leverage / working_capital / watch) ending with a forward-looking credit-risk watchpoint. ~10–15s end-to-end.
- [x] **Ask-the-Filing** (May 5, 2026) — `POST /spreads/{id}/ask` endpoint and Q&A card on the KPIs tab. Persists the full extracted document text on `extraction_jobs` (migration 0002), then answers free-text questions with a source-section hint (e.g. "Item 1A — Risk Factors", "Note 8 — Debt"). Strictly grounded — refuses to answer outside the document.
- [x] **QuickBooks Online connector — demo stub** (May 5, 2026) — `POST /quickbooks/spreads/{spread_id}/periods/{period_id}/import` writes a fixed 27-line trial balance for an "Acme Manufacturing (Demo Sandbox)" entity to demonstrate the direct-accounting-system pattern. Real OAuth + token store + COA mapping is v2 (target Q3 2026); router contract is stable.
- [x] **Excel export** (May 5, 2026) — `GET /spreads/{id}/export.xlsx` returns an `.xlsx` workbook with one sheet per statement (IS / BS / CF), period columns side-by-side, indigo header band, total-row highlighting, and accounting number format. openpyxl backend; banner with borrower + deal name. Bank-branded layout deferred.
- [x] **Reopen workflow transition** (May 5, 2026) — `completed → draft` allowed for owner-analyst, sr_credit_analyst, admin. Frontend renders Reopen as a secondary button alongside the primary forward action. State-machine forward-only assumption removed; reviewer-rejection use case now supported.
- [ ] AI call logging + audit table
- [ ] User management admin panel
- [ ] Performance testing (50 concurrent users)
- [ ] SOC 2 controls implementation begins

### Phase 5: GA Launch & Growth (Target — Q4 2026)

- [ ] Multi-institution tenant isolation
- [ ] LOS integration (Finastra, nCino) — API only
- [ ] Batch spreading (multiple PDFs in queue)
- [ ] Custom covenant threshold configuration UI
- [ ] Mobile-responsive layout improvements
- [ ] SOC 2 Type II audit

---

## 15. Open Questions

| ID | Question | Owner | Target Resolution |
|----|----------|-------|------------------|
| OQ-01 | What is the target institution size? Community banks (assets <$1B) or mid-size ($1B–$10B)? This affects compliance requirements and pricing model. | Product | Q2 2026 |
| OQ-02 | Should extraction results be cacheable across institutions for the same public financial statement (e.g., SEC filings)? Requires careful data privacy analysis. | Eng + Legal | Q3 2026 |
| OQ-03 | Is there appetite for a fine-tuned extraction model vs. general-purpose Claude? Fine-tuning could improve accuracy 5–10% but adds significant MLOps overhead. | Eng | Q3 2026 |
| OQ-04 | What is the pricing model? Per-spread, per-seat, or enterprise contract? Affects AI API cost management strategy. | Product | Q2 2026 |
| OQ-05 | Should narrative generation support institutional "voice" customization (e.g., inject institution-specific boilerplate or risk appetite language)? | Product | Q3 2026 |
| OQ-06 | How should the system handle tax-basis vs GAAP adjustments? Some institutions require explicit normalization steps. | Credit SME | Q2 2026 |
| OQ-07 | Is real-time collaboration (multiple analysts on same spread simultaneously) in scope for v2? | Product | Q3 2026 |

---

## 16. Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| **Spreading** | The process of extracting and organizing financial statement data into a standardized format for credit analysis |
| **RMA** | Risk Management Association — provides industry-standard financial statement spreading templates and industry benchmarks |
| **UCA Cash Flow** | Uniform Credit Analysis Cash Flow — standardized methodology for calculating operating cash flow used by US bank regulators |
| **DSCR** | Debt Service Coverage Ratio — measures a borrower's ability to cover debt payments from operating cash flow (DSCR = NOI / Debt Service) |
| **Covenant** | A contractual obligation in a loan agreement; financial covenants require maintaining specific ratio thresholds |
| **Breach** | When a financial ratio falls outside an agreed covenant threshold |
| **Credit Memo** | A formal document summarizing a credit request and analysis, presented to the credit committee for approval |
| **LOS** | Loan Origination System — core banking software managing the loan application and approval process |

### B. Competitor Landscape

| Competitor | Focus | Key Gap vs. SpreadSense AI |
|------------|-------|---------------------------|
| Moody's CreditLens | Enterprise, large banks | Not AI-native; complex UI; expensive |
| Baker Hill NextGen | Community banking | Legacy architecture; no AI extraction |
| Sageworks (Abrigo) | SME lending | Weak AI narrative; no vision extraction |
| Numerated | Digital lending | Consumer-focused; no spreading workflow |
| Manual (Excel) | Ubiquitous | No AI; no audit trail; error-prone |

### C. Related Documents

- Plan 4: PDF Credit Memo Export Design Spec (`docs/superpowers/specs/2026-04-18-spreadsense-plan-4-pdf-credit-memo-design.md`)
- Plan 5: Workflow Design Spec (`docs/superpowers/specs/2026-04-18-spreadsense-plan-5-workflow-design.md`)
- Plan 6: Dashboard & Reporting (`docs/superpowers/plans/2026-04-19-plan-6-dashboard-reporting.md`)
- Plan 7: Navigation & Layout (`docs/superpowers/plans/2026-04-19-plan-7-navigation-layout.md`)

---

*SpreadSense AI PRD v1.0 — April 19, 2026 — Arun Rajendiran*
*Document generated with AI assistance (Claude Sonnet 4.6). All strategic decisions and requirements reflect human judgment.*
