"""fill null passwords with derpe123 default and restore not null

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-17
"""

from alembic import op
import sqlalchemy as sa
from passlib.context import CryptContext

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
DEFAULT_HASH = _pwd.hash("derpe123")


def upgrade() -> None:
    op.alter_column("users", "hashed_password", existing_type=sa.String(255), nullable=True)
    op.execute(f"UPDATE users SET hashed_password = '{DEFAULT_HASH}' WHERE hashed_password IS NULL")
    op.alter_column("users", "hashed_password", existing_type=sa.String(255), nullable=False)


def downgrade() -> None:
    op.alter_column("users", "hashed_password", existing_type=sa.String(255), nullable=True)
