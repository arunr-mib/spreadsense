from pydantic import BaseModel
from typing import Optional


class RatioSet(BaseModel):
    dscr: Optional[float] = None
    leverage: Optional[float] = None
    current_ratio: Optional[float] = None
    interest_coverage: Optional[float] = None
    ebitda_margin: Optional[float] = None
    gross_margin: Optional[float] = None
    net_profit_margin: Optional[float] = None
    return_on_assets: Optional[float] = None


class PeriodAnalytics(BaseModel):
    period_id: int
    fiscal_year: int
    period_type: str
    ratios: RatioSet
    breaches: list[str]
    near_threshold: list[str]


class SpreadAnalyticsRead(BaseModel):
    spread_id: int
    periods: list[PeriodAnalytics]
