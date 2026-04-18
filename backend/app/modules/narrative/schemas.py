from pydantic import BaseModel, Field
from datetime import datetime


class NarrativeVersionRead(BaseModel):
    id: int
    spread_id: int
    version: int
    content: str
    created_by: int
    created_by_name: str  # resolved via JOIN to users.full_name
    created_at: datetime

    model_config = {"from_attributes": True}


class NarrativeSaveRequest(BaseModel):
    content: str = Field(min_length=1)
