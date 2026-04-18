from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class BorrowerCreate(BaseModel):
    name: str
    tax_id: Optional[str] = None
    sic_code: Optional[str] = None
    fiscal_year_end_month: int = 12
    industry: Optional[str] = None


class BorrowerUpdate(BaseModel):
    name: Optional[str] = None
    tax_id: Optional[str] = None
    sic_code: Optional[str] = None
    fiscal_year_end_month: Optional[int] = None
    industry: Optional[str] = None


class BorrowerRead(BaseModel):
    id: int
    name: str
    tax_id: Optional[str]
    sic_code: Optional[str]
    fiscal_year_end_month: int
    industry: Optional[str]
    created_by: int
    created_at: datetime
    model_config = {"from_attributes": True}
