import enum
from datetime import datetime, timezone
from typing import Optional, Any
from sqlalchemy import String, ForeignKey, DateTime, Enum as SAEnum, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ExtractionStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    ready = "ready"
    confirmed = "confirmed"
    failed = "failed"


class ExtractionJob(Base):
    __tablename__ = "extraction_jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    spread_id: Mapped[int] = mapped_column(ForeignKey("spreads.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[ExtractionStatus] = mapped_column(
        SAEnum(ExtractionStatus), nullable=False, default=ExtractionStatus.pending
    )
    phase: Mapped[str] = mapped_column(String(32), nullable=False, default="uploading")
    results: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
