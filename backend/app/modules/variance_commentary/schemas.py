from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

VarianceCategory = Literal[
    "revenue",
    "margins",
    "liquidity",
    "leverage",
    "working_capital",
    "watch",
]


class VarianceBullet(BaseModel):
    text: str
    category: VarianceCategory


class VarianceCommentaryResponse(BaseModel):
    bullets: list[VarianceBullet]
    periods_analyzed: list[str]
    generated_at: datetime
