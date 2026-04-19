from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class BreachAlert(BaseModel):
    spread_id: int
    deal_name: str
    borrower_name: str
    ratio_name: str        # e.g. "dscr", "leverage"
    value: Optional[float]
    threshold: float
    direction: str         # "min" (breach when below) or "max" (breach when above)
    severity: str          # "breach" or "near_threshold"


class SpreadSummary(BaseModel):
    id: int
    deal_name: str
    borrower_name: str
    status: str
    analyst_name: str      # resolved from spread.created_by → User.full_name
    alert_count: int
    updated_at: datetime


class StatusCounts(BaseModel):
    draft: int
    completed: int
    reviewed: int
    exported: int
    total: int


class PortfolioSummary(BaseModel):
    status_counts: StatusCounts
    breach_alerts: list[BreachAlert]
    spread_summaries: list[SpreadSummary]
