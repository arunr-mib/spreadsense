from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CreditMemoMetaWrite(BaseModel):
    recommendation: Optional[str] = None    # approve | approve_with_conditions | decline
    risk_rating: Optional[str] = None       # pass | watch | special_mention | substandard | doubtful
    facility_type: Optional[str] = None     # term_loan | revolving_credit | line_of_credit | other
    facility_amount: Optional[float] = None
    facility_purpose: Optional[str] = None
    facility_maturity: Optional[str] = None
    collateral: Optional[str] = None


class CreditMemoMetaRead(CreditMemoMetaWrite):
    id: int
    spread_id: int
    updated_at: datetime
    model_config = {"from_attributes": True}
