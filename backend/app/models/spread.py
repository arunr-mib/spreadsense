import enum
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SpreadStatus(str, enum.Enum):
    draft = "draft"
    completed = "completed"
    reviewed = "reviewed"
    exported = "exported"


class Spread(Base):
    __tablename__ = "spreads"

    id: Mapped[int] = mapped_column(primary_key=True)
    borrower_id: Mapped[int] = mapped_column(ForeignKey("borrowers.id"), nullable=False)
    deal_name: Mapped[str] = mapped_column(String(255), nullable=False)
    loan_type_id: Mapped[Optional[int]] = mapped_column(ForeignKey("loan_types.id"), nullable=True)
    status: Mapped[SpreadStatus] = mapped_column(
        SAEnum(SpreadStatus), nullable=False, default=SpreadStatus.draft
    )
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    assigned_reviewer: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
