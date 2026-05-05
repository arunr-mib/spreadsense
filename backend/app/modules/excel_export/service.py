"""Excel export — write a borrower's spread (IS / BS / CF + ratios) to an
.xlsx workbook the analyst can hand to the credit committee.

Demo cut: single sheet per statement, plain table, bold headers + bordered
cells. Bank-branded layout is roadmap.
"""
from __future__ import annotations

from io import BytesIO

from fastapi import HTTPException
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.borrower import Borrower
from app.models.spread import Spread
from app.models.spread_line_item import SpreadLineItem
from app.models.spread_period import SpreadPeriod
from app.models.user import User, UserRole

STATEMENT_LABELS = {
    "IS": "Income Statement",
    "BS": "Balance Sheet",
    "CF": "Cash Flow",
}

HEADER_FILL = PatternFill(start_color="4338CA", end_color="4338CA", fill_type="solid")
HEADER_FONT = Font(bold=True, color="FFFFFF", size=11)
LABEL_FONT = Font(bold=True, size=10)
BORDER_THIN = Side(style="thin", color="CBD5E1")
CELL_BORDER = Border(left=BORDER_THIN, right=BORDER_THIN, top=BORDER_THIN, bottom=BORDER_THIN)
TOTAL_FILL = PatternFill(start_color="EEF2FF", end_color="EEF2FF", fill_type="solid")


def _humanize_field(key: str) -> str:
    """net_sales -> Net Sales; sg_and_a -> SG&A."""
    if key == "sg_and_a":
        return "SG&A"
    return key.replace("_", " ").title()


async def _get_spread_with_borrower(
    spread_id: int, user: User, db: AsyncSession
) -> tuple[Spread, Borrower | None]:
    q = select(Spread).where(Spread.id == spread_id)
    if user.role == UserRole.analyst:
        q = q.where(Spread.created_by == user.id)
    spread = (await db.execute(q)).scalar_one_or_none()
    if not spread:
        raise HTTPException(status_code=404, detail="Spread not found")
    borrower = (
        await db.execute(select(Borrower).where(Borrower.id == spread.borrower_id))
    ).scalar_one_or_none()
    return spread, borrower


async def _load_periods_with_items(
    spread_id: int, db: AsyncSession
) -> list[tuple[SpreadPeriod, dict[str, dict[str, float | None]]]]:
    """Returns [(period, {statement: {field_key: value, ...}, ...}), ...]
    sorted by fiscal_year ascending."""
    periods = (
        await db.execute(
            select(SpreadPeriod)
            .where(SpreadPeriod.spread_id == spread_id)
            .order_by(SpreadPeriod.fiscal_year)
        )
    ).scalars().all()

    out: list[tuple[SpreadPeriod, dict[str, dict[str, float | None]]]] = []
    for period in periods:
        items = (
            await db.execute(
                select(SpreadLineItem).where(
                    SpreadLineItem.spread_period_id == period.id
                )
            )
        ).scalars().all()
        by_stmt: dict[str, dict[str, float | None]] = {"IS": {}, "BS": {}, "CF": {}}
        for item in items:
            by_stmt.setdefault(item.statement, {})[item.rma_field_key] = item.value
        out.append((period, by_stmt))
    return out


def _all_field_keys(
    periods_data: list[tuple[SpreadPeriod, dict[str, dict[str, float | None]]]],
    statement: str,
) -> list[str]:
    """Stable union of field keys across periods, preserving first-seen order."""
    seen: list[str] = []
    seen_set: set[str] = set()
    for _, by_stmt in periods_data:
        for key in by_stmt.get(statement, {}).keys():
            if key not in seen_set:
                seen.append(key)
                seen_set.add(key)
    return seen


def _write_statement_sheet(
    wb: Workbook,
    sheet_title: str,
    statement: str,
    spread_label: str,
    borrower_name: str,
    periods_data: list[tuple[SpreadPeriod, dict[str, dict[str, float | None]]]],
) -> None:
    ws = wb.create_sheet(sheet_title)

    # Banner
    ws.cell(row=1, column=1, value=borrower_name).font = Font(bold=True, size=14)
    ws.cell(row=2, column=1, value=spread_label).font = Font(italic=True, color="64748B")
    ws.cell(row=3, column=1, value=STATEMENT_LABELS[statement]).font = Font(bold=True, size=12)

    # Header row at row 5
    header_row = 5
    ws.cell(row=header_row, column=1, value="Line Item").font = HEADER_FONT
    ws.cell(row=header_row, column=1).fill = HEADER_FILL
    ws.cell(row=header_row, column=1).border = CELL_BORDER
    ws.cell(row=header_row, column=1).alignment = Alignment(horizontal="left")

    for col_idx, (period, _) in enumerate(periods_data, start=2):
        cell = ws.cell(row=header_row, column=col_idx, value=f"FY {period.fiscal_year}")
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.border = CELL_BORDER
        cell.alignment = Alignment(horizontal="right")

    # Body
    keys = _all_field_keys(periods_data, statement)
    for row_idx, key in enumerate(keys, start=header_row + 1):
        is_total = "total" in key or key in {"ebitda", "ebit", "net_income", "gross_profit"}
        label_cell = ws.cell(row=row_idx, column=1, value=_humanize_field(key))
        label_cell.font = LABEL_FONT if is_total else Font(size=10)
        label_cell.border = CELL_BORDER
        if is_total:
            label_cell.fill = TOTAL_FILL
        for col_idx, (_, by_stmt) in enumerate(periods_data, start=2):
            value = by_stmt.get(statement, {}).get(key)
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.number_format = '#,##0;(#,##0);"-"'
            cell.alignment = Alignment(horizontal="right")
            cell.border = CELL_BORDER
            if is_total:
                cell.fill = TOTAL_FILL
                cell.font = Font(bold=True)

    # Column widths
    ws.column_dimensions["A"].width = 36
    for col_idx in range(2, len(periods_data) + 2):
        ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = 18


async def build_excel(
    spread_id: int, user: User, db: AsyncSession
) -> tuple[bytes, str]:
    """Build the .xlsx workbook and return (bytes, filename)."""
    spread, borrower = await _get_spread_with_borrower(spread_id, user, db)
    borrower_name = borrower.name if borrower else "Unknown Borrower"
    spread_label = f"{spread.deal_name} (Spread #{spread.id})"

    periods_data = await _load_periods_with_items(spread_id, db)
    if not periods_data:
        raise HTTPException(
            status_code=422,
            detail="No periods to export — add a fiscal year period first.",
        )

    wb = Workbook()
    # remove the default sheet
    default = wb.active
    if default is not None:
        wb.remove(default)

    for stmt in ("IS", "BS", "CF"):
        _write_statement_sheet(
            wb, STATEMENT_LABELS[stmt], stmt, spread_label, borrower_name, periods_data
        )

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)

    safe_borrower = "".join(
        c if c.isalnum() else "_" for c in borrower_name
    ).strip("_")[:40] or "borrower"
    filename = f"{safe_borrower}_Spread_{spread_id}.xlsx"
    return buf.read(), filename
