"""cover_image_url varchar(500) -> text para suportar base64

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-16
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "reports",
        "cover_image_url",
        existing_type=sa.String(500),
        type_=sa.Text(),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "reports",
        "cover_image_url",
        existing_type=sa.Text(),
        type_=sa.String(500),
        existing_nullable=True,
    )
