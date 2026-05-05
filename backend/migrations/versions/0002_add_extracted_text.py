"""add extracted_text to extraction_jobs

Stores the full plain-text extracted from the source document so the
Ask-the-Filing endpoint can answer free-text questions over it without
re-parsing the original file.

Revision ID: 0002_extracted_text
Revises: 0001_phase
Create Date: 2026-05-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0002_extracted_text'
down_revision: Union[str, Sequence[str], None] = '0001_phase'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'extraction_jobs',
        sa.Column('extracted_text', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('extraction_jobs', 'extracted_text')
