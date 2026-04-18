import pytest
from sqlalchemy import text

@pytest.mark.asyncio
async def test_all_tables_created(db):
    result = await db.execute(text(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
    ))
    tables = {row[0] for row in result}
    expected = {
        "users", "loan_types", "borrowers", "spreads",
        "spread_periods", "spread_line_items", "adjustments",
        "narrative_versions", "workflow_comments", "audit_log"
    }
    assert expected.issubset(tables)
