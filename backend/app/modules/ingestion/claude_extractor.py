"""
Claude API integration for financial statement extraction.
Returns: {"IS": {field_key: {"value": float|None, "confidence_score": float}}, "BS": {...}, "CF": {...}}
"""
import json
import logging
import re
from typing import Literal
from app.config import settings
from app.modules.ingestion.rma_template import IS_FIELDS, BS_FIELDS, CF_FIELDS

logger = logging.getLogger(__name__)

_EXTRACTION_PROMPT_TEMPLATE = """
You are a financial spreading analyst. Extract financial figures from the document text below
and map them to the provided RMA field list.

Return a JSON object with this structure:
{{
  "IS": {{
    "<rma_field_key>": {{"value": <number or null>, "confidence_score": <0.0-1.0>}}
  }},
  "BS": {{...}},
  "CF": {{...}}
}}

Rules:
- confidence_score 0.85+ means you are highly confident in the extracted value
- confidence_score below 0.85 means you found the value but are less certain
- Use null for value if the field is not present in the document
- All monetary values should be in the document's base unit (no rescaling)
- Do NOT include computed/subtotal fields — only the raw input fields listed below

RMA field keys to extract:
IS (Income Statement): {is_keys}
BS (Balance Sheet): {bs_keys}
CF (Cash Flow): {cf_keys}

Document text:
---
{document_text}
---

Return only the JSON object, no markdown, no explanation.
"""

# SEC 10-K filings are typically 300k-500k chars but the actual financial
# numbers we need live in a ~80k window starting around the "CONSOLIDATED
# BALANCE SHEETS" header. Sending only that slice is cheaper, faster, and
# avoids losing the financials to a naive head-of-document truncation.
_FIN_SECTION_CHARS = 100_000   # how much to send once we find the start
_FALLBACK_MAX_CHARS = 500_000  # if no header found, send up to this much

# Match common section headers across 10-K and 10-Q filings.
# Variants: "Statements of Operations", "Statement of Income",
# "Balance Sheets", "Statements of Cash Flows", etc.
_FIN_STMT_HEADER = re.compile(
    r"CONSOLIDATED\s+(BALANCE\s+SHEETS?"
    r"|STATEMENTS?\s+OF\s+(OPERATIONS|INCOME|EARNINGS|CASH\s+FLOWS?))",
    re.IGNORECASE,
)


def _slice_financial_section(text: str) -> str:
    """Return a focused slice covering the financial statements block.

    Locates the first occurrence of a 'Consolidated Balance Sheet / Statement
    of Operations / Cash Flows' header and returns a generous window starting
    a bit before it. Falls back to a head-of-document truncation if no header
    is found (e.g. a non-10-K document).
    """
    match = _FIN_STMT_HEADER.search(text)
    if not match:
        logger.warning(
            "No 'Consolidated ...' header found in document; falling back to "
            "first %d chars (financial statements may not be present)",
            _FALLBACK_MAX_CHARS,
        )
        return text[:_FALLBACK_MAX_CHARS]
    start = max(0, match.start() - 2_000)
    end = min(len(text), start + _FIN_SECTION_CHARS)
    logger.info(
        "Sliced financial statements block: chars %d-%d (header '%s' at char %d)",
        start, end, match.group(0).strip(), match.start(),
    )
    return text[start:end]


_NON_COMPUTED_IS = [(f["key"], f["label"]) for f in IS_FIELDS if not f["computed"]]
_NON_COMPUTED_BS = [(f["key"], f["label"]) for f in BS_FIELDS if not f["computed"]]
_NON_COMPUTED_CF = [(f["key"], f["label"]) for f in CF_FIELDS if not f["computed"]]

_STMT_FIELDS = {
    "IS": _NON_COMPUTED_IS,
    "BS": _NON_COMPUTED_BS,
    "CF": _NON_COMPUTED_CF,
}


def _format_field_list(fields: list[tuple[str, str]]) -> str:
    """Format fields as 'key (Label)' pairs so Claude can match document terminology."""
    return ", ".join(f"{key} ({label})" for key, label in fields)

_SINGLE_STMT_PROMPT = """
You are a financial spreading analyst. Extract financial figures from the document text below
and map them to the provided RMA field list for the {statement_label} statement.

Return a JSON object with this structure:
{{
  "<rma_field_key>": {{"value": <number or null>, "confidence_score": <0.0-1.0>}}
}}

Rules:
- Each field is listed as: field_key (Human-readable label). Use the label to find the matching
  line item in the document, then return the value under the field_key.
- confidence_score 0.85+ means highly confident; below 0.85 means less certain
- Use null for value if the field is not present in the document
- All monetary values in the document's base unit (no rescaling, no unit conversion)
- Do NOT include computed/subtotal fields — only the raw input fields listed below
- For 10-K filings: "Revenues" or "Total revenues" maps to net_sales; "Cost of revenues" maps
  to cost_of_goods_sold; look for the most recent fiscal year column

Fields to extract (key → label):
{field_keys}

Document text:
---
{document_text}
---

Return only the JSON object, no markdown, no explanation.
"""

_STMT_LABELS = {"IS": "Income Statement", "BS": "Balance Sheet", "CF": "Cash Flow"}


async def extract_statement(document_text: str, statement: Literal["IS", "BS", "CF"]) -> dict:
    """Extract fields for a single statement type: IS, BS, or CF.

    Returns:
        dict mapping rma_field_key -> {"value": float | None, "confidence_score": float}
    """
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set in environment")

    if statement not in _STMT_FIELDS:
        raise ValueError(f"Unknown statement type '{statement}'. Must be one of: IS, BS, CF")

    import anthropic
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    sliced = _slice_financial_section(document_text)
    prompt = _SINGLE_STMT_PROMPT.format(
        statement_label=_STMT_LABELS[statement],
        field_keys=_format_field_list(_STMT_FIELDS[statement]),
        document_text=sliced,
    )

    logger.info(
        "Sending %s prompt to Claude (sliced %d of %d total chars)",
        statement, len(sliced), len(document_text),
    )
    message = await client.messages.create(
        model="claude-opus-4-5",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = message.content[0].text.strip()
    logger.info("Claude raw response for %s (first 300 chars): %s", statement, raw[:300])

    # Strip markdown code fences if Claude wrapped the JSON (e.g. ```json ... ```)
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    if raw.endswith("```"):
        raw = raw[:-3].strip()

    try:
        result = json.loads(raw)
        non_null = sum(1 for v in result.values() if v.get("value") is not None)
        logger.info("Claude extracted %d/%d non-null values for %s", non_null, len(result), statement)
        return result
    except json.JSONDecodeError as e:
        logger.error("Claude returned invalid JSON for %s: %s", statement, raw[:500])
        raise ValueError(f"Claude returned invalid JSON for {statement}: {e}") from e


async def extract_financials(document_text: str) -> dict:
    """
    Call Claude API and return structured extraction results.
    Raises RuntimeError if ANTHROPIC_API_KEY is not set.
    """
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set in environment")

    import anthropic
    # Use AsyncAnthropic so the await does not block the FastAPI event loop
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    prompt = _EXTRACTION_PROMPT_TEMPLATE.format(
        is_keys=_format_field_list(_NON_COMPUTED_IS),
        bs_keys=_format_field_list(_NON_COMPUTED_BS),
        cf_keys=_format_field_list(_NON_COMPUTED_CF),
        document_text=_slice_financial_section(document_text),  # safety truncation
    )

    message = await client.messages.create(
        model="claude-opus-4-5",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = message.content[0].text.strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error("Claude returned invalid JSON: %s", raw[:500])
        raise ValueError(f"Claude returned invalid JSON: {e}") from e
