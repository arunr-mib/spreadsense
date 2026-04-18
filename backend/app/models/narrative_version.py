from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class NarrativeVersion(Base):
    __tablename__ = "narrative_versions"
    __table_args__ = (UniqueConstraint("spread_id", "version"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    spread_id: Mapped[int] = mapped_column(ForeignKey("spreads.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
