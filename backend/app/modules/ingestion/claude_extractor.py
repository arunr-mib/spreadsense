"""
Claude API integration for financial statement extraction.
Returns: {"IS": {field_key: {"value": float|None, "confidence_score": float}}, "BS": {...}, "CF": {...}}
"""
import json
import logging
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

_NON_COMPUTED_IS = [f["key"] for f in IS_FIELDS if not f["computed"]]
_NON_COMPUTED_BS = [f["key"] for f in BS_FIELDS if not f["computed"]]
_NON_COMPUTED_CF = [f["key"] for f in CF_FIELDS if not f["computed"]]


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
        is_keys=", ".join(_NON_COMPUTED_IS),
        bs_keys=", ".join(_NON_COMPUTED_BS),
        cf_keys=", ".join(_NON_COMPUTED_CF),
        document_text=document_text[:150_000],  # safety truncation
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
