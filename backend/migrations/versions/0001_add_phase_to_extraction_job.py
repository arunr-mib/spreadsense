"""add phase to extraction_job and failed status

Revision ID: 0001_phase
Revises: eeddf3d4fbd9
Create Date: 2026-04-19

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0001_phase'
down_revision: Union[str, Sequence[str], None] = 'eeddf3d4fbd9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add 'failed' to the existing PostgreSQL enum
    op.execute("ALTER TYPE extractionstatus ADD VALUE IF NOT EXISTS 'failed'")
    # Add phase column with default 'uploading'
    op.add_column(
        'extraction_jobs',
        sa.Column('phase', sa.String(32), nullable=False, server_default='uploading')
    )


def downgrade() -> None:
    op.drop_column('extraction_jobs', 'phase')
    # Note: PostgreSQL does not support removing enum values; downgrade leaves the enum extended
