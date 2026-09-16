"""make email nullable — login is now username-based

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-16
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("users", "email", existing_type=sa.String(255), nullable=True)
    op.execute("UPDATE users SET email = NULL WHERE email = ''")


def downgrade() -> None:
    op.execute("UPDATE users SET email = '' WHERE email IS NULL")
    op.alter_column("users", "email", existing_type=sa.String(255), nullable=False)
