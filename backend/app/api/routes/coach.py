"""
Coach–Trainee Management API.

Includes secure push-notification delivery from coach to trainee.

All endpoints require an authenticated user via Bearer JWT.
Coach-specific endpoints additionally verify that the requesting user
has an active CoachProfile row.

Security invariants enforced here:
  1. coach_id is always taken from the JWT, never from the request body.
  2. Access to trainee data is gated on an active CoachingRelationship row.
  3. Invitation tokens are stored only as SHA-256 hashes.
  4. Expired invitations are rejected even if status is still "pending".
  5. The trainee may revoke access at any time; revocation is immediate.
  6. The coach may end an active relationship; access is removed immediately.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user
from app.db.database import get_db
from app.db.models import (
    CoachingAccessNotice,
    CoachingGoal,
    CoachingInvitation,
    CoachingRelationship,
    CoachProfile,
    PushSubscription,
    User,
    UserData,
)
from app.core.config import settings
from app.models.coach import (
    AccessNoticeOut,
    CoachProfileCreate,
    CoachProfileOut,
    GoalCreate,
    GoalOut,
    InvitationCreate,
    InvitationOut,
    NotifyTraineeRequest,
    RelationshipOut,
    TraineeListItem,
    TraineeSyncBuckets,
)

router = APIRouter(tags=["coaching"])

INVITATION_TTL_DAYS = 7
COACH_READABLE_BUCKETS = {"tracker", "history", "meals", "body", "personal_plan", "workouts"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _utcnow() -> datetime:
    """Return current UTC time as a *naive* datetime.

    SQLite stores datetime values without timezone info, so comparisons must
    use naive UTC datetimes to avoid 'offset-naive vs offset-aware' errors.
    PostgreSQL stores with tz, so both sides will be tz-aware there.
    Using naive UTC consistently works on both engines.
    """
    return datetime.utcnow()  # noqa: DTZ003


def _as_naive_utc(dt: datetime) -> datetime:
    """Strip tzinfo from a datetime without converting the value."""
    if dt.tzinfo is not None:
        return dt.replace(tzinfo=None)
    return dt


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _get_coach_profile(db: Session, user_id: str) -> CoachProfile:
    """Return the active CoachProfile for user_id or raise 403."""
    cp = db.scalar(
        select(CoachProfile).where(
            CoachProfile.user_id == user_id,
            CoachProfile.is_active.is_(True),
        )
    )
    if cp is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="אין פרופיל מאמן פעיל",
        )
    return cp


def _username(db: Session, user_id: str) -> str:
    user = db.get(User, user_id)
    return user.username if user else "משתמש"


def _queue_access_notice(
    db: Session,
    *,
    recipient_user_id: str,
    relationship_id: str,
    kind: str,
    actor_username: str,
    message: str,
) -> None:
    """Persist an in-app notice for the other party after access ends."""
    db.add(
        CoachingAccessNotice(
            recipient_user_id=recipient_user_id,
            relationship_id=relationship_id,
            kind=kind,
            actor_username=actor_username,
            message=message,
        )
    )


def _best_effort_push(
    db: Session,
    *,
    user_id: str,
    title: str,
    body: str,
    tag: str,
) -> None:
    """Send a Web Push if configured; never fail the primary request."""
    import json as _json
    import logging

    if not settings.vapid_private_key or not settings.vapid_subject:
        return
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        return

    logger = logging.getLogger(__name__)
    subs = db.scalars(
        select(PushSubscription).where(PushSubscription.user_id == user_id)
    ).all()
    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=_json.dumps({"title": title, "body": body, "tag": tag}),
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_subject},
            )
        except WebPushException as exc:
            logger.warning("Access-notice push failed for %s: %s", sub.endpoint[:40], exc)
            if getattr(exc.response, "status_code", None) in (404, 410):
                db.delete(sub)
    try:
        db.commit()
    except Exception:
        db.rollback()


def _get_active_relationship(db: Session, coach_id: str, trainee_id: str) -> CoachingRelationship:
    """Return the active relationship or raise 403."""
    rel = db.scalar(
        select(CoachingRelationship).where(
            CoachingRelationship.coach_id == coach_id,
            CoachingRelationship.trainee_id == trainee_id,
            CoachingRelationship.status == "active",
        )
    )
    if rel is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="אין קשר פעיל בין המאמן למתאמן זה",
        )
    return rel


def _expire_stale_invitations(
    db: Session,
    *,
    coach_id: str | None = None,
    trainee_email: str | None = None,
) -> None:
    """Mark expired pending invitations — called lazily on reads.

    Scoped to the invitations the caller can see, so each request does not
    load every pending invitation in the system.
    """
    now = _utcnow()
    query = select(CoachingInvitation).where(CoachingInvitation.status == "pending")
    if coach_id is not None:
        query = query.where(CoachingInvitation.coach_id == coach_id)
    if trainee_email is not None:
        query = query.where(CoachingInvitation.trainee_email == trainee_email)
    stale = db.scalars(query).all()
    stale = [s for s in stale if _as_naive_utc(s.expires_at) < now]
    for inv in stale:
        inv.status = "expired"
    if stale:
        db.commit()


# ---------------------------------------------------------------------------
# Coach profile
# ---------------------------------------------------------------------------

@router.post("/coach/profile", response_model=CoachProfileOut, status_code=status.HTTP_201_CREATED)
def create_coach_profile(
    body: CoachProfileCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> CoachProfile:
    """Activate the coaching role for the current user."""
    existing = db.scalar(
        select(CoachProfile).where(CoachProfile.user_id == current_user.id)
    )
    if existing:
        if existing.is_active:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="פרופיל מאמן כבר קיים",
            )
        existing.is_active = True
        existing.bio = body.bio
        db.commit()
        db.refresh(existing)
        return existing

    profile = CoachProfile(user_id=current_user.id, bio=body.bio)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/coach/profile", response_model=CoachProfileOut)
def get_coach_profile(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> CoachProfile:
    return _get_coach_profile(db, current_user.id)


@router.patch("/coach/profile", response_model=CoachProfileOut)
def update_coach_profile(
    body: CoachProfileCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> CoachProfile:
    profile = _get_coach_profile(db, current_user.id)
    profile.bio = body.bio
    db.commit()
    db.refresh(profile)
    return profile


@router.delete("/coach/profile", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_coach_profile(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> None:
    """
    Deactivate the coach profile for the current user.

    - Sets is_active = False on the CoachProfile row.
    - All active coaching relationships are ended immediately.
    - Pending outgoing invitations are cancelled.
    - The user retains their nutrition data and existing account.
    """
    profile = db.scalar(
        select(CoachProfile).where(CoachProfile.user_id == current_user.id)
    )
    if profile is None or not profile.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="אין פרופיל מאמן פעיל")

    # End all active relationships and notify each trainee
    active_rels = db.scalars(
        select(CoachingRelationship).where(
            CoachingRelationship.coach_id == current_user.id,
            CoachingRelationship.status == "active",
        )
    ).all()
    notice_targets: list[tuple[str, str]] = []
    for rel in active_rels:
        rel.status = "ended"
        rel.ended_at = _utcnow()
        for goal in db.scalars(
            select(CoachingGoal).where(
                CoachingGoal.relationship_id == rel.id,
                CoachingGoal.status == "proposed",
            )
        ).all():
            goal.status = "superseded"
        _delete_pair_invitations(db, coach_id=rel.coach_id, trainee_id=rel.trainee_id)
        msg = (
            f"המאמן {current_user.username} הסיר אותך מרשימת המתאמנים שלו. "
            "הגישה לנתונים שלך בוטלה."
        )
        _queue_access_notice(
            db,
            recipient_user_id=rel.trainee_id,
            relationship_id=rel.id,
            kind="coach_removed",
            actor_username=current_user.username,
            message=msg,
        )
        notice_targets.append((rel.trainee_id, msg))

    # Cancel all pending invitations
    pending_invs = db.scalars(
        select(CoachingInvitation).where(
            CoachingInvitation.coach_id == current_user.id,
            CoachingInvitation.status == "pending",
        )
    ).all()
    for inv in pending_invs:
        inv.status = "cancelled"

    profile.is_active = False
    db.commit()

    for trainee_id, msg in notice_targets:
        _best_effort_push(
            db,
            user_id=trainee_id,
            title="המאמן הסיר אותך",
            body=msg,
            tag="coach-access-ended",
        )


# ---------------------------------------------------------------------------
# Invitations — coach side
# ---------------------------------------------------------------------------

@router.post("/coach/invitations", response_model=InvitationOut, status_code=status.HTTP_201_CREATED)
def send_invitation(
    body: InvitationCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> InvitationOut:
    """
    Coach invites a trainee by email.

    Security: duplicate pending invitations to the same email from the same
    coach are rejected. The raw token is returned once and never stored.
    """
    _get_coach_profile(db, current_user.id)
    _expire_stale_invitations(db, coach_id=current_user.id)

    trainee_email = str(body.trainee_email).lower().strip()

    # Prevent coaching yourself
    if trainee_email == current_user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="לא ניתן להזמין את עצמך כמתאמן",
        )

    # Duplicate pending invitation guard
    existing = db.scalar(
        select(CoachingInvitation).where(
            CoachingInvitation.coach_id == current_user.id,
            CoachingInvitation.trainee_email == trainee_email,
            CoachingInvitation.status == "pending",
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="כבר קיימת הזמנה פעילה לכתובת זו",
        )

    # Check if they're already an active trainee
    trainee_user = db.scalar(
        select(User).where(User.email == trainee_email, User.is_active.is_(True))
    )
    if trainee_user:
        already_active = db.scalar(
            select(CoachingRelationship).where(
                CoachingRelationship.coach_id == current_user.id,
                CoachingRelationship.trainee_id == trainee_user.id,
                CoachingRelationship.status == "active",
            )
        )
        if already_active:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="משתמש זה כבר מתאמן פעיל שלך",
            )

    raw_token = secrets.token_urlsafe(32)
    inv = CoachingInvitation(
        coach_id=current_user.id,
        trainee_email=trainee_email,
        trainee_id=trainee_user.id if trainee_user else None,
        token_hash=_hash_token(raw_token),
        status="pending",
        expires_at=_utcnow() + timedelta(days=INVITATION_TTL_DAYS),
        message=body.message,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)

    out = InvitationOut.model_validate(inv)
    out.coach_username = current_user.username
    out.coach_email = current_user.email
    # The raw_token is returned only here — not stored anywhere
    # Frontend should display it or construct an invitation link
    return out


@router.get("/coach/invitations", response_model=list[InvitationOut])
def list_coach_invitations(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> list[InvitationOut]:
    _get_coach_profile(db, current_user.id)
    _expire_stale_invitations(db, coach_id=current_user.id)
    invitations = db.scalars(
        select(CoachingInvitation)
        .where(CoachingInvitation.coach_id == current_user.id)
        .order_by(CoachingInvitation.created_at.desc())
    ).all()
    return [InvitationOut.model_validate(i) for i in invitations]


@router.delete("/coach/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_invitation(
    invitation_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> None:
    """Cancel a pending invitation, or permanently remove a non-pending one from the coach's list."""
    _get_coach_profile(db, current_user.id)
    inv = db.scalar(
        select(CoachingInvitation).where(
            CoachingInvitation.id == invitation_id,
            CoachingInvitation.coach_id == current_user.id,
        )
    )
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הזמנה לא נמצאה")
    if inv.status == "pending":
        inv.status = "cancelled"
        db.commit()
        return
    # Accepted / rejected / expired / cancelled — remove from the coach inbox.
    db.delete(inv)
    db.commit()


# ---------------------------------------------------------------------------
# Invitations — trainee side
# ---------------------------------------------------------------------------

@router.get("/trainee/invitations", response_model=list[InvitationOut])
def list_trainee_invitations(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> list[InvitationOut]:
    """Return all invitations sent to the current user's email address."""
    _expire_stale_invitations(db, trainee_email=current_user.email.lower())
    invitations = db.scalars(
        select(CoachingInvitation).where(
            CoachingInvitation.trainee_email == current_user.email.lower(),
        ).order_by(CoachingInvitation.created_at.desc())
    ).all()

    result = []
    for inv in invitations:
        out = InvitationOut.model_validate(inv)
        coach = db.get(User, inv.coach_id)
        if coach:
            out.coach_username = coach.username
            out.coach_email = coach.email
        result.append(out)
    return result


@router.post("/trainee/invitations/{invitation_id}/accept", response_model=RelationshipOut)
def accept_invitation(
    invitation_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> CoachingRelationship:
    """
    Trainee explicitly accepts an invitation.

    Only invitations addressed to the current user's email may be accepted.
    The pair has a single CoachingRelationship row (uq_coaching_pair), so a
    previously revoked/ended relationship is reactivated instead of inserted.
    """
    _expire_stale_invitations(db, trainee_email=current_user.email.lower())
    inv = db.scalar(
        select(CoachingInvitation).where(
            CoachingInvitation.id == invitation_id,
            CoachingInvitation.trainee_email == current_user.email.lower(),
        )
    )
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הזמנה לא נמצאה")
    if inv.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"ההזמנה כבר בסטטוס '{inv.status}'",
        )
    if _as_naive_utc(inv.expires_at) < _utcnow():
        inv.status = "expired"
        db.commit()
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="ההזמנה פגה תוקף")

    coach_active = db.scalar(
        select(CoachProfile.id).where(
            CoachProfile.user_id == inv.coach_id,
            CoachProfile.is_active.is_(True),
        )
    )
    if coach_active is None:
        inv.status = "cancelled"
        db.commit()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="המאמן כבר אינו פעיל")

    inv.status = "accepted"
    inv.trainee_id = current_user.id
    inv.responded_at = _utcnow()

    rel = db.scalar(
        select(CoachingRelationship).where(
            CoachingRelationship.coach_id == inv.coach_id,
            CoachingRelationship.trainee_id == current_user.id,
        )
    )
    if rel is None:
        rel = CoachingRelationship(
            coach_id=inv.coach_id,
            trainee_id=current_user.id,
            status="active",
        )
        db.add(rel)
    elif rel.status != "active":
        rel.status = "active"
        rel.started_at = _utcnow()
        rel.ended_at = None
        # Proposals made before the pair was disconnected must not become
        # acceptable again just because the trainee reconnected.
        for goal in db.scalars(
            select(CoachingGoal).where(
                CoachingGoal.relationship_id == rel.id,
                CoachingGoal.status == "proposed",
            )
        ).all():
            goal.status = "superseded"
    db.commit()
    db.refresh(rel)
    return rel


@router.post("/trainee/invitations/{invitation_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
def reject_invitation(
    invitation_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> None:
    _expire_stale_invitations(db, trainee_email=current_user.email.lower())
    inv = db.scalar(
        select(CoachingInvitation).where(
            CoachingInvitation.id == invitation_id,
            CoachingInvitation.trainee_email == current_user.email.lower(),
        )
    )
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הזמנה לא נמצאה")
    if inv.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"ההזמנה כבר בסטטוס '{inv.status}'",
        )
    inv.status = "rejected"
    inv.responded_at = _utcnow()
    db.commit()


# ---------------------------------------------------------------------------
# Relationships — either side can disconnect
# ---------------------------------------------------------------------------

def _delete_pair_invitations(db: Session, *, coach_id: str, trainee_id: str) -> None:
    """Remove sent invitations for this coach↔trainee pair.

    Ending a relationship should not leave a leftover "accepted" (or stale
    pending) invite that the coach must delete separately from the trainee list.
    """
    trainee = db.get(User, trainee_id)
    trainee_email = (trainee.email or "").strip().lower() if trainee else ""
    invitations = db.scalars(
        select(CoachingInvitation).where(CoachingInvitation.coach_id == coach_id)
    ).all()
    for inv in invitations:
        email_match = trainee_email and inv.trainee_email.strip().lower() == trainee_email
        id_match = inv.trainee_id == trainee_id
        if email_match or id_match:
            db.delete(inv)


def _end_active_relationship(
    db: Session,
    *,
    relationship_id: str,
    coach_id: str | None = None,
    trainee_id: str | None = None,
    new_status: str,
    actor_user: User,
) -> CoachingRelationship:
    filters = [
        CoachingRelationship.id == relationship_id,
        CoachingRelationship.status == "active",
    ]
    if coach_id is not None:
        filters.append(CoachingRelationship.coach_id == coach_id)
    if trainee_id is not None:
        filters.append(CoachingRelationship.trainee_id == trainee_id)
    rel = db.scalar(select(CoachingRelationship).where(*filters))
    if rel is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="קשר פעיל לא נמצא")
    rel.status = new_status
    rel.ended_at = _utcnow()
    # Open proposals are no longer actionable after disconnect.
    for goal in db.scalars(
        select(CoachingGoal).where(
            CoachingGoal.relationship_id == rel.id,
            CoachingGoal.status == "proposed",
        )
    ).all():
        goal.status = "superseded"

    # One remove action: drop the matching sent invitation(s) too.
    _delete_pair_invitations(db, coach_id=rel.coach_id, trainee_id=rel.trainee_id)

    if new_status == "ended":
        # Coach removed the trainee → notify the trainee.
        recipient_id = rel.trainee_id
        kind = "coach_removed"
        message = (
            f"המאמן {actor_user.username} הסיר אותך מרשימת המתאמנים שלו. "
            "הגישה לנתונים שלך בוטלה."
        )
        push_title = "המאמן הסיר אותך"
        push_tag = "coach-access-ended"
    else:
        # Trainee revoked → notify the coach.
        recipient_id = rel.coach_id
        kind = "trainee_revoked"
        message = (
            f"המתאמן {actor_user.username} ביטל את הגישה שלך לנתונים שלו "
            "והוסר מרשימת המתאמנים."
        )
        push_title = "מתאמן ביטל גישה"
        push_tag = "trainee-access-revoked"

    _queue_access_notice(
        db,
        recipient_user_id=recipient_id,
        relationship_id=rel.id,
        kind=kind,
        actor_username=actor_user.username,
        message=message,
    )
    db.commit()
    _best_effort_push(
        db,
        user_id=recipient_id,
        title=push_title,
        body=message,
        tag=push_tag,
    )
    return rel


@router.post(
    "/trainee/relationships/{relationship_id}/revoke",
    status_code=status.HTTP_204_NO_CONTENT,
)
def revoke_coach_access(
    relationship_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> None:
    """
    Trainee revokes a coach's access immediately.

    The relationship is marked 'revoked' and ended_at is set. Any subsequent
    attempt by the coach to read trainee data will receive 403. The coach
    receives an in-app (and best-effort push) notice.
    """
    _end_active_relationship(
        db,
        relationship_id=relationship_id,
        trainee_id=current_user.id,
        new_status="revoked",
        actor_user=current_user,
    )


@router.post(
    "/coach/relationships/{relationship_id}/end",
    status_code=status.HTTP_204_NO_CONTENT,
)
def coach_end_relationship(
    relationship_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> None:
    """
    Coach removes a trainee: ends the active relationship immediately.

    Status becomes 'ended' (distinct from trainee-initiated 'revoked').
    Proposed goals on the pair are superseded. The trainee is notified and
    can be re-invited later.
    """
    _get_coach_profile(db, current_user.id)
    _end_active_relationship(
        db,
        relationship_id=relationship_id,
        coach_id=current_user.id,
        new_status="ended",
        actor_user=current_user,
    )


@router.get("/trainee/relationships", response_model=list[RelationshipOut])
def list_trainee_relationships(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> list[RelationshipOut]:
    rows = list(
        db.scalars(
            select(CoachingRelationship)
            .where(CoachingRelationship.trainee_id == current_user.id)
            .order_by(CoachingRelationship.started_at.desc())
        ).all()
    )
    result: list[RelationshipOut] = []
    for rel in rows:
        result.append(
            RelationshipOut(
                id=rel.id,
                coach_id=rel.coach_id,
                trainee_id=rel.trainee_id,
                status=rel.status,
                started_at=rel.started_at,
                ended_at=rel.ended_at,
                coach_username=_username(db, rel.coach_id),
            )
        )
    return result


@router.get("/coaching/access-notices", response_model=list[AccessNoticeOut])
def list_access_notices(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> list[CoachingAccessNotice]:
    """Pending notices that the other party ended access (coach or trainee)."""
    return list(
        db.scalars(
            select(CoachingAccessNotice)
            .where(
                CoachingAccessNotice.recipient_user_id == current_user.id,
                CoachingAccessNotice.acknowledged_at.is_(None),
            )
            .order_by(CoachingAccessNotice.created_at.asc())
        ).all()
    )


@router.post(
    "/coaching/access-notices/{notice_id}/ack",
    status_code=status.HTTP_204_NO_CONTENT,
)
def acknowledge_access_notice(
    notice_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> None:
    notice = db.scalar(
        select(CoachingAccessNotice).where(
            CoachingAccessNotice.id == notice_id,
            CoachingAccessNotice.recipient_user_id == current_user.id,
        )
    )
    if notice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הודעה לא נמצאה")
    if notice.acknowledged_at is None:
        notice.acknowledged_at = _utcnow()
        db.commit()


# ---------------------------------------------------------------------------
# Coach — trainee management
# ---------------------------------------------------------------------------

@router.get("/coach/trainees", response_model=list[TraineeListItem])
def list_trainees(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> list[TraineeListItem]:
    _get_coach_profile(db, current_user.id)
    relationships = db.scalars(
        select(CoachingRelationship).where(
            CoachingRelationship.coach_id == current_user.id,
            CoachingRelationship.status == "active",
        ).order_by(CoachingRelationship.started_at.desc())
    ).all()

    result = []
    for rel in relationships:
        trainee = db.get(User, rel.trainee_id)
        if trainee and trainee.is_active:
            result.append(
                TraineeListItem(
                    relationship_id=rel.id,
                    trainee_id=trainee.id,
                    username=trainee.username,
                    email=trainee.email,
                    started_at=rel.started_at,
                    status=rel.status,
                )
            )
    return result


@router.get("/coach/trainees/{trainee_id}/profile")
def get_trainee_profile(
    trainee_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> dict:
    """Return basic profile of an authorised trainee."""
    _get_coach_profile(db, current_user.id)
    _get_active_relationship(db, current_user.id, trainee_id)

    trainee = db.get(User, trainee_id)
    if trainee is None or not trainee.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="מתאמן לא נמצא")

    return {
        "id": trainee.id,
        "username": trainee.username,
        "email": trainee.email,
        "created_at": trainee.created_at,
    }


@router.post("/coach/trainees/{trainee_id}/notify", status_code=status.HTTP_204_NO_CONTENT)
def notify_trainee(
    trainee_id: str,
    body: NotifyTraineeRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> None:
    """
    Coach sends a push notification to an authorised trainee.

    Security: requires an active coaching relationship. The push is delivered
    via the VAPID Web Push protocol — no raw device tokens are exposed.
    """
    import json as _json
    import logging
    from pywebpush import webpush, WebPushException

    _get_coach_profile(db, current_user.id)
    _get_active_relationship(db, current_user.id, trainee_id)

    if not settings.vapid_private_key or not settings.vapid_subject:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Push notifications are not configured on this server",
        )

    subs = db.scalars(
        select(PushSubscription).where(PushSubscription.user_id == trainee_id)
    ).all()

    if not subs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="המתאמן לא הפעיל התראות על מכשיר זה",
        )

    logger = logging.getLogger(__name__)
    sent = 0
    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=_json.dumps({
                    "title": body.title,
                    "body": body.body,
                    "tag": body.tag,
                }),
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_subject},
            )
            sent += 1
        except WebPushException as exc:
            logger.warning("Coach push failed for sub %s: %s", sub.endpoint[:40], exc)
            # 404/410: the browser dropped this subscription; it can never succeed again.
            if getattr(exc.response, "status_code", None) in (404, 410):
                db.delete(sub)
    db.commit()

    if sent == 0:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="לא הצלחנו לשלוח את ההתראה — ייתכן שהמתאמן ביטל הרשאות",
        )


@router.get("/coach/trainees/{trainee_id}/sync", response_model=TraineeSyncBuckets)
def get_trainee_sync(
    trainee_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> TraineeSyncBuckets:
    """
    Return authorised sync buckets for a trainee.

    Security:
    - coach_id comes from the JWT, never the request.
    - Active relationship is verified before any data is returned.
    - Only COACH_READABLE_BUCKETS are ever returned (no settings, passwords, etc.).
    """
    _get_coach_profile(db, current_user.id)
    _get_active_relationship(db, current_user.id, trainee_id)

    rows = db.scalars(
        select(UserData).where(
            UserData.user_id == trainee_id,
            UserData.key.in_(COACH_READABLE_BUCKETS),
        )
    ).all()

    buckets: dict[str, str | None] = {k: None for k in COACH_READABLE_BUCKETS}
    latest_ts: datetime | None = None
    for row in rows:
        buckets[row.key] = row.value_json
        if latest_ts is None or row.updated_at > latest_ts:
            latest_ts = row.updated_at

    return TraineeSyncBuckets(
        tracker=buckets.get("tracker"),
        history=buckets.get("history"),
        meals=buckets.get("meals"),
        body=buckets.get("body"),
        workouts=buckets.get("workouts"),
        personal_plan=buckets.get("personal_plan"),
        updated_at=latest_ts,
    )


# ---------------------------------------------------------------------------
# Goals — coach proposes, trainee accepts/rejects
# ---------------------------------------------------------------------------

@router.post(
    "/coach/trainees/{trainee_id}/goals",
    response_model=GoalOut,
    status_code=status.HTTP_201_CREATED,
)
def propose_goal(
    trainee_id: str,
    body: GoalCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> CoachingGoal:
    _get_coach_profile(db, current_user.id)
    rel = _get_active_relationship(db, current_user.id, trainee_id)

    goal = CoachingGoal(
        relationship_id=rel.id,
        goal_type=body.goal_type,
        target_value=body.target_value,
        unit=body.unit,
        note=body.note,
        status="proposed",
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


@router.get("/coach/trainees/{trainee_id}/goals", response_model=list[GoalOut])
def list_goals_for_trainee(
    trainee_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> list[CoachingGoal]:
    _get_coach_profile(db, current_user.id)
    rel = _get_active_relationship(db, current_user.id, trainee_id)
    return list(
        db.scalars(
            select(CoachingGoal)
            .where(CoachingGoal.relationship_id == rel.id)
            .order_by(CoachingGoal.created_at.desc())
        ).all()
    )


@router.get("/trainee/goals", response_model=list[GoalOut])
def list_my_goals(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> list[CoachingGoal]:
    """Return all goals proposed to the current user by their coaches."""
    rels = db.scalars(
        select(CoachingRelationship).where(
            CoachingRelationship.trainee_id == current_user.id,
            CoachingRelationship.status == "active",
        )
    ).all()
    rel_ids = [r.id for r in rels]
    if not rel_ids:
        return []
    return list(
        db.scalars(
            select(CoachingGoal)
            .where(CoachingGoal.relationship_id.in_(rel_ids))
            .order_by(CoachingGoal.created_at.desc())
        ).all()
    )


@router.post("/trainee/goals/{goal_id}/accept", status_code=status.HTTP_204_NO_CONTENT)
def accept_goal(
    goal_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> None:
    goal = db.scalar(
        select(CoachingGoal)
        .join(CoachingRelationship, CoachingGoal.relationship_id == CoachingRelationship.id)
        .where(
            CoachingGoal.id == goal_id,
            CoachingRelationship.trainee_id == current_user.id,
            CoachingRelationship.status == "active",
            CoachingGoal.status == "proposed",
        )
    )
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="יעד לא נמצא")
    goal.status = "accepted"
    goal.responded_at = _utcnow()
    db.commit()


@router.post("/trainee/goals/{goal_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
def reject_goal(
    goal_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> None:
    goal = db.scalar(
        select(CoachingGoal)
        .join(CoachingRelationship, CoachingGoal.relationship_id == CoachingRelationship.id)
        .where(
            CoachingGoal.id == goal_id,
            CoachingRelationship.trainee_id == current_user.id,
            CoachingRelationship.status == "active",
            CoachingGoal.status == "proposed",
        )
    )
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="יעד לא נמצא")
    goal.status = "rejected"
    goal.responded_at = _utcnow()
    db.commit()
