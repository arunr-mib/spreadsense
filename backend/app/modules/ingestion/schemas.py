from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime


class ExtractionJobRead(BaseModel):
    id: int
    spread_id: int
    filename: str
    file_type: str
    status: str
    phase: str
    results: Optional[Any]
    created_at: datetime
    model_config = {"from_attributes": True}


class ConfirmExtractionRequest(BaseModel):
    period_id: int
    overrides: dict[str, float] = {}
