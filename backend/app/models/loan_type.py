from typing import Optional

from sqlalchemy import Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class LoanType(Base):
    __tablename__ = "loan_types"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dscr_min: Mapped[Optional[float]] = mapped_column(Numeric(6, 3), nullable=True)
    leverage_max: Mapped[Optional[float]] = mapped_column(Numeric(6, 3), nullable=True)
    current_ratio_min: Mapped[Optional[float]] = mapped_column(Numeric(6, 3), nullable=True)
    interest_coverage_min: Mapped[Optional[float]] = mapped_column(Numeric(6, 3), nullable=True)
