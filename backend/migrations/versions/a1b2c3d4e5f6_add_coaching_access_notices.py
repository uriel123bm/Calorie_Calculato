"""add_coaching_access_notices

Revision ID: a1b2c3d4e5f6
Revises: 6823b74c395c
Create Date: 2026-11-17 18:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "6823b74c395c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "coaching_access_notices",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("recipient_user_id", sa.String(length=36), nullable=False),
        sa.Column("relationship_id", sa.String(length=36), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("actor_username", sa.String(length=64), nullable=False),
        sa.Column("message", sa.String(length=500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["recipient_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["relationship_id"], ["coaching_relationships.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("coaching_access_notices", schema=None) as batch_op:
        batch_op.create_index(
            "ix_can_recipient_ack", ["recipient_user_id", "acknowledged_at"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("coaching_access_notices", schema=None) as batch_op:
        batch_op.drop_index("ix_can_recipient_ack")
    op.drop_table("coaching_access_notices")
