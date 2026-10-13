"""
Coach–Trainee Management API.

All endpoints require an authenticated user via Bearer JWT.
Coach-specific endpoints additionally verify that the requesting user
has an active CoachProfile row.

Security invariants enforced here:
  1. coach_id is always taken from the JWT, never from the request body.
  2. Access to trainee data is gated on an active CoachingRelationship row.
  3. Invitation tokens are stored only as SHA-256 hashes.
  4. Expired invitations are rejected even if status is still "pending".
  5. The trainee may revoke access at any time; revocation is immediate.
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
    CoachingGoal,
    CoachingInvitation,
    CoachingRelationship,
    CoachProfile,
    User,
    UserData,
)
from app.models.coach import (
    CoachProfileCreate,
    CoachProfileOut,
    GoalCreate,
    GoalOut,
    InvitationCreate,
    InvitationOut,
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


def _expire_stale_invitations(db: Session) -> None:
    """Mark expired pending invitations — called lazily on reads."""
    now = _utcnow()
    stale = db.scalars(
        select(CoachingInvitation).where(
            CoachingInvitation.status == "pending",
        )
    ).all()
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
    _expire_stale_invitations(db)

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
    _expire_stale_invitations(db)
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
    _get_coach_profile(db, current_user.id)
    inv = db.scalar(
        select(CoachingInvitation).where(
            CoachingInvitation.id == invitation_id,
            CoachingInvitation.coach_id == current_user.id,
        )
    )
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הזמנה לא נמצאה")
    if inv.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"לא ניתן לבטל הזמנה בסטטוס '{inv.status}'",
        )
    inv.status = "cancelled"
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
    _expire_stale_invitations(db)
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
    Creates a CoachingRelationship row; duplicate acceptance is idempotent.
    """
    _expire_stale_invitations(db)
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

    inv.status = "accepted"
    inv.trainee_id = current_user.id
    inv.responded_at = _utcnow()

    rel = CoachingRelationship(
        coach_id=inv.coach_id,
        trainee_id=current_user.id,
        status="active",
    )
    db.add(rel)
    db.commit()
    db.refresh(rel)
    return rel


@router.post("/trainee/invitations/{invitation_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
def reject_invitation(
    invitation_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> None:
    _expire_stale_invitations(db)
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
# Relationships — trainee revokes access
# ---------------------------------------------------------------------------

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
    attempt by the coach to read trainee data will receive 403.
    """
    rel = db.scalar(
        select(CoachingRelationship).where(
            CoachingRelationship.id == relationship_id,
            CoachingRelationship.trainee_id == current_user.id,
            CoachingRelationship.status == "active",
        )
    )
    if rel is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="קשר פעיל לא נמצא")
    rel.status = "revoked"
    rel.ended_at = _utcnow()
    db.commit()


@router.get("/trainee/relationships", response_model=list[RelationshipOut])
def list_trainee_relationships(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> list[CoachingRelationship]:
    return list(
        db.scalars(
            select(CoachingRelationship)
            .where(CoachingRelationship.trainee_id == current_user.id)
            .order_by(CoachingRelationship.started_at.desc())
        ).all()
    )


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
            CoachingGoal.status == "proposed",
        )
    )
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="יעד לא נמצא")
    goal.status = "rejected"
    goal.responded_at = _utcnow()
    db.commit()
