from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class SpreadPeriodCreate(BaseModel):
    fiscal_year: int = Field(ge=1900, le=2100)
    period_type: str = Field(pattern="^(actual|projected)$")


class SpreadPeriodRead(BaseModel):
    id: int
    spread_id: int
    fiscal_year: int
    period_type: str
    locked: bool
    model_config = {"from_attributes": True}


class LineItemUpdate(BaseModel):
    value: Optional[float] = None
    updated_at: Optional[datetime] = None  # client sends current updated_at for optimistic lock


class SpreadLineItemRead(BaseModel):
    id: Optional[int] = None      # None for computed rows (no DB row)
    spread_period_id: int
    statement: str
    rma_field_key: str
    label: str
    value: Optional[float]
    computed: bool
    source: Optional[str] = None  # manual | pdf | xlsx | docx | None for computed
    confidence_score: Optional[float] = None
    updated_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


class BalanceSheetValidationPeriod(BaseModel):
    period_id: int
    fiscal_year: int
    balanced: bool
    total_assets: Optional[float]
    total_liabilities_and_equity: Optional[float]
    difference: Optional[float]


class BalanceSheetValidationResponse(BaseModel):
    spread_id: int
    all_balanced: bool
    periods: list[BalanceSheetValidationPeriod]
