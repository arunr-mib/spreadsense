from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CreditMemoMeta(Base):
    __tablename__ = "credit_memo_meta"

    id: Mapped[int] = mapped_column(primary_key=True)
    spread_id: Mapped[int] = mapped_column(
        ForeignKey("spreads.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    recommendation: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    risk_rating: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    facility_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    facility_amount: Mapped[Optional[float]] = mapped_column(Numeric(18, 2), nullable=True)
    facility_purpose: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    facility_maturity: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    collateral: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
