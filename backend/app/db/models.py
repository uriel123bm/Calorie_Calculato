"""
ORM models for user authentication, synced client blobs, and coaching system.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(128), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )


class UserData(Base):
    """JSON blobs synced from localStorage (tracker, recipes, meals, …)."""

    __tablename__ = "user_data"
    __table_args__ = (
        UniqueConstraint("user_id", "key", name="uq_user_data_user_key"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    key: Mapped[str] = mapped_column(String(32), nullable=False)
    value_json: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )


class PushSubscription(Base):
    """Web Push subscription endpoint per user device."""

    __tablename__ = "push_subscriptions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    endpoint: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    p256dh: Mapped[str] = mapped_column(String(256), nullable=False)
    auth: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )


class RefreshToken(Base):
    """Server-side refresh token sessions for rotation + revocation."""

    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    jti: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)
    replaced_by_jti: Mapped[str | None] = mapped_column(String(64), nullable=True)


# ---------------------------------------------------------------------------
# Coaching system models
# ---------------------------------------------------------------------------

class CoachProfile(Base):
    """Extended profile for users who activate the coach role.

    Existence of a CoachProfile row is what grants coaching privileges —
    there is no separate 'role' column on the users table.
    """

    __tablename__ = "coach_profiles"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"),
        unique=True, index=True, nullable=False
    )
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )


class CoachingRelationship(Base):
    """Active or historical coach–trainee pair after an invitation is accepted.

    Cardinality: a trainee can have at most one active coach at a time
    (enforced by a partial unique index on coach_id + trainee_id; only one
    row per pair may have status='active').
    """

    __tablename__ = "coaching_relationships"
    __table_args__ = (
        # Prevent duplicate active pairs
        UniqueConstraint("coach_id", "trainee_id", name="uq_coaching_pair"),
        Index("ix_cr_coach_status",   "coach_id",   "status"),
        Index("ix_cr_trainee_status", "trainee_id", "status"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    coach_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    trainee_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # status: active | revoked | ended
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CoachingInvitation(Base):
    """Pending invitation from a coach to a prospective trainee.

    Security properties:
    - token_hash stores SHA-256(raw_token); the raw token is never persisted.
    - expires_at is checked on every use (default 7 days).
    - Duplicate pending invitations to the same email are rejected by the
      partial unique index uq_pending_coach_email.
    """

    __tablename__ = "coaching_invitations"
    __table_args__ = (
        Index("ix_ci_coach_id",     "coach_id"),
        Index("ix_ci_trainee_id",   "trainee_id"),
        Index("ix_ci_trainee_email","trainee_email"),
        Index("ix_ci_token_hash",   "token_hash", unique=True),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    coach_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # The email the invitation was addressed to (may not yet be a user)
    trainee_email: Mapped[str] = mapped_column(String(255), nullable=False)
    # Filled in when the trainee accepts (links to the users row)
    trainee_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # SHA-256 of the one-time token sent to the trainee
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    # status: pending | accepted | rejected | expired | cancelled
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    message: Mapped[str | None] = mapped_column(String(500), nullable=True)


class CoachingGoal(Base):
    """A nutrition / fitness goal proposed by a coach for a specific trainee.

    The trainee must explicitly accept the goal for it to become active.
    A coach may only propose; the trainee retains ownership of their targets.
    """

    __tablename__ = "coaching_goals"
    __table_args__ = (
        Index("ix_cg_relationship", "relationship_id"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    relationship_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("coaching_relationships.id", ondelete="CASCADE"), nullable=False
    )
    # Type: calories | protein | carbs | fat | consistency
    goal_type: Mapped[str] = mapped_column(String(30), nullable=False)
    target_value: Mapped[float] = mapped_column(nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False, default="kcal")
    # status: proposed | accepted | rejected | superseded
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="proposed")
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
