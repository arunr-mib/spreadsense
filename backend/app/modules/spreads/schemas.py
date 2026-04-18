from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class SpreadCreate(BaseModel):
    borrower_id: int
    deal_name: str
    loan_type_id: Optional[int] = None


class SpreadRead(BaseModel):
    id: int
    borrower_id: int
    deal_name: str
    loan_type_id: Optional[int]
    status: str
    created_by: int
    assigned_reviewer: Optional[int]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
