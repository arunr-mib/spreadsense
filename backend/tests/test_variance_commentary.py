import json

import pytest
from fastapi import HTTPException
from unittest.mock import AsyncMock, patch

from app.core.security import hash_password
from app.models.borrower import Borrower
from app.models.spread import Spread, SpreadStatus
from app.models.spread_line_item import SpreadLineItem
from app.models.spread_period import SpreadPeriod, PeriodType
from app.models.user import User, UserRole
from app.modules.variance_commentary.service import (
    _parse_response,
    generate_variance_commentary,
)


def test_parse_response_strips_code_fences():
    raw = '```json\n{"bullets": [{"text": "Revenue fell 12%.", "category": "revenue"}]}\n```'
    bullets = _parse_response(raw)
    assert len(bullets) == 1
    assert bullets[0].category == "revenue"
    assert bullets[0].text == "Revenue fell 12%."


def test_parse_response_falls_back_unknown_category_to_watch():
    raw = json.dumps(
        {"bullets": [{"text": "Some narrative.", "category": "made_up"}]}
    )
    bullets = _parse_response(raw)
    assert bullets[0].category == "watch"


def test_parse_response_skips_blank_bullets():
    raw = json.dumps(
        {
            "bullets": [
                {"text": "", "category": "revenue"},
                {"text": "Real bullet.", "category": "margins"},
            ]
        }
    )
    bullets = _parse_response(raw)
    assert len(bullets) == 1
    assert bullets[0].text == "Real bullet."


def test_parse_response_invalid_json_raises_502():
    with pytest.raises(HTTPException) as exc:
        _parse_response("not json at all { ;")
    assert exc.value.status_code == 502


def test_parse_response_empty_bullets_raises_502():
    with pytest.raises(HTTPException) as exc:
        _parse_response('{"bullets": []}')
    assert exc.value.status_code == 502


@pytest.fixture
async def vc_user(db):
    u = User(
        email="vc@bank.com",
        full_name="VC Analyst",
        hashed_password=hash_password("pass123"),
        role=UserRole.analyst,
    )
    db.add(u)
    await db.flush()
    await db.refresh(u)
    return u


@pytest.fixture
async def vc_spread_one_period(db, vc_user):
    b = Borrower(name="VCco", fiscal_year_end_month=12, created_by=vc_user.id)
    db.add(b)
    await db.flush()
    s = Spread(
        borrower_id=b.id,
        deal_name="VCco Deal",
        status=SpreadStatus.draft,
        created_by=vc_user.id,
    )
    db.add(s)
    await db.flush()
    p = SpreadPeriod(spread_id=s.id, fiscal_year=2024, period_type=PeriodType.actual)
    db.add(p)
    await db.flush()
    db.add(
        SpreadLineItem(
            spread_period_id=p.id,
            statement="IS",
            rma_field_key="net_sales",
            value=1_000_000,
            source="manual",
        )
    )
    await db.flush()
    await db.refresh(s)
    return s


@pytest.fixture
async def vc_spread_two_periods(db, vc_user):
    b = Borrower(name="VCco", fiscal_year_end_month=12, created_by=vc_user.id)
    db.add(b)
    await db.flush()
    s = Spread(
        borrower_id=b.id,
        deal_name="VCco Deal",
        status=SpreadStatus.draft,
        created_by=vc_user.id,
    )
    db.add(s)
    await db.flush()
    for fy, sales in ((2023, 1_000_000), (2024, 880_000)):
        p = SpreadPeriod(
            spread_id=s.id, fiscal_year=fy, period_type=PeriodType.actual
        )
        db.add(p)
        await db.flush()
        db.add(
            SpreadLineItem(
                spread_period_id=p.id,
                statement="IS",
                rma_field_key="net_sales",
                value=sales,
                source="manual",
            )
        )
        await db.flush()
    await db.refresh(s)
    return s


async def test_generate_requires_two_periods(db, vc_user, vc_spread_one_period):
    with pytest.raises(HTTPException) as exc:
        await generate_variance_commentary(vc_spread_one_period.id, vc_user, db)
    assert exc.value.status_code == 422
    assert "two periods" in exc.value.detail.lower()


async def test_generate_happy_path_with_mocked_claude(
    db, vc_user, vc_spread_two_periods
):
    fake_response = json.dumps(
        {
            "bullets": [
                {
                    "text": "Net sales fell 12% YoY ($1.0M to $0.88M).",
                    "category": "revenue",
                },
                {
                    "text": "Watch: continued contraction may pressure leverage covenants.",
                    "category": "watch",
                },
            ]
        }
    )
    with patch(
        "app.modules.variance_commentary.service._claude_generate",
        new=AsyncMock(return_value=fake_response),
    ):
        result = await generate_variance_commentary(
            vc_spread_two_periods.id, vc_user, db
        )

    assert len(result.bullets) == 2
    assert result.bullets[0].category == "revenue"
    assert result.bullets[1].category == "watch"
    assert result.periods_analyzed == ["FY2023", "FY2024"]
