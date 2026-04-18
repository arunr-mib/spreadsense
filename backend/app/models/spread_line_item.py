from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SpreadLineItem(Base):
    __tablename__ = "spread_line_items"
    __table_args__ = (UniqueConstraint("spread_period_id", "statement", "rma_field_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    spread_period_id: Mapped[int] = mapped_column(ForeignKey("spread_periods.id"), nullable=False)
    statement: Mapped[str] = mapped_column(String(2), nullable=False)  # IS | BS | CF
    rma_field_key: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[Optional[float]] = mapped_column(Numeric(18, 2), nullable=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    confidence_score: Mapped[Optional[float]] = mapped_column(Numeric(4, 3), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
