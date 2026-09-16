"""add sistemas and tipos filter fields to reports

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-16
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("reports", sa.Column("sistemas", sa.JSON(), nullable=True))
    op.add_column("reports", sa.Column("tipos", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("reports", "tipos")
    op.drop_column("reports", "sistemas")
