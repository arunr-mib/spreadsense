import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PeriodType(str, enum.Enum):
    actual = "actual"
    projected = "projected"


class SpreadPeriod(Base):
    __tablename__ = "spread_periods"
    __table_args__ = (UniqueConstraint("spread_id", "fiscal_year"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    spread_id: Mapped[int] = mapped_column(ForeignKey("spreads.id"), nullable=False)
    fiscal_year: Mapped[int] = mapped_column(Integer, nullable=False)
    period_type: Mapped[PeriodType] = mapped_column(SAEnum(PeriodType), nullable=False)
    locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    locked_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    locked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
