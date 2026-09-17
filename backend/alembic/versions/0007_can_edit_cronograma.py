"""add can_edit_cronograma to users

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-17
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("can_edit_cronograma", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("users", "can_edit_cronograma")
