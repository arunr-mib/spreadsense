from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime


class ExtractedField(BaseModel):
    rma_field_key: str
    label: str
    value: Optional[float]
    confidence_score: float
    flagged: bool  # True if confidence_score < threshold


class ExtractionJobRead(BaseModel):
    id: int
    spread_id: int
    filename: str
    file_type: str
    status: str
    results: Optional[Any]  # raw JSON from Claude
    created_at: datetime
    model_config = {"from_attributes": True}


class ConfirmExtractionRequest(BaseModel):
    period_id: int  # which SpreadPeriod to write values into
    # Analyst-corrected values: keys are "STMT.field_key" (e.g. "IS.net_sales"), values override Claude's extracted value
    overrides: dict[str, float] = {}
