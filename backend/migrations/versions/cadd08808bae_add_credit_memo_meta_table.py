"""add credit_memo_meta table

Revision ID: cadd08808bae
Revises: eeddf3d4fbd9
Create Date: 2026-04-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cadd08808bae'
down_revision: Union[str, Sequence[str], None] = 'eeddf3d4fbd9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'credit_memo_meta',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('spread_id', sa.Integer(), nullable=False),
        sa.Column('recommendation', sa.String(32), nullable=True),
        sa.Column('risk_rating', sa.String(32), nullable=True),
        sa.Column('facility_type', sa.String(64), nullable=True),
        sa.Column('facility_amount', sa.Numeric(18, 2), nullable=True),
        sa.Column('facility_purpose', sa.Text(), nullable=True),
        sa.Column('facility_maturity', sa.String(64), nullable=True),
        sa.Column('collateral', sa.Text(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['spread_id'], ['spreads.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('spread_id'),
    )


def downgrade() -> None:
    op.drop_table('credit_memo_meta')
