"""add extraction_jobs table

Revision ID: eeddf3d4fbd9
Revises: e41fb146095b
Create Date: 2026-04-18 00:54:51.942107

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'eeddf3d4fbd9'
down_revision: Union[str, Sequence[str], None] = 'e41fb146095b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'extraction_jobs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('spread_id', sa.Integer(), nullable=False),
        sa.Column('filename', sa.String(length=500), nullable=False),
        sa.Column('file_type', sa.String(length=10), nullable=False),
        sa.Column('status', sa.Enum('pending', 'processing', 'ready', 'confirmed', name='extractionstatus'), nullable=False, server_default='pending'),
        sa.Column('results', sa.JSON(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['spread_id'], ['spreads.id']),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('extraction_jobs')
    sa.Enum(name="extractionstatus").drop(op.get_bind())
