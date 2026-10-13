"""Pydantic schemas for the coaching system."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


# ---------------------------------------------------------------------------
# Coach profile
# ---------------------------------------------------------------------------

class CoachProfileCreate(BaseModel):
    bio: Optional[str] = Field(None, max_length=500)


class CoachProfileOut(BaseModel):
    id: str
    user_id: str
    bio: Optional[str]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Invitations
# ---------------------------------------------------------------------------

class InvitationCreate(BaseModel):
    trainee_email: EmailStr
    message: Optional[str] = Field(None, max_length=500)


class InvitationOut(BaseModel):
    id: str
    coach_id: str
    trainee_email: str
    trainee_id: Optional[str]
    status: str
    expires_at: datetime
    created_at: datetime
    responded_at: Optional[datetime]
    message: Optional[str]
    # Hydrated coach info (for trainee-facing views)
    coach_username: Optional[str] = None
    coach_email: Optional[str] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Relationships
# ---------------------------------------------------------------------------

class RelationshipOut(BaseModel):
    id: str
    coach_id: str
    trainee_id: str
    status: str
    started_at: datetime
    ended_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Trainee list item (coach dashboard)
# ---------------------------------------------------------------------------

class TraineeListItem(BaseModel):
    relationship_id: str
    trainee_id: str
    username: str
    email: str
    started_at: datetime
    status: str


# ---------------------------------------------------------------------------
# Goals
# ---------------------------------------------------------------------------

class GoalCreate(BaseModel):
    goal_type: str = Field(..., pattern=r"^(calories|protein|carbs|fat|consistency)$")
    target_value: float = Field(..., ge=0)
    unit: str = Field(default="kcal", max_length=20)
    note: Optional[str] = Field(None, max_length=500)

    @field_validator("target_value")
    @classmethod
    def positive(cls, v: float) -> float:
        if v < 0:
            raise ValueError("target_value must be non-negative")
        return v


class GoalOut(BaseModel):
    id: str
    relationship_id: str
    goal_type: str
    target_value: float
    unit: str
    status: str
    note: Optional[str]
    created_at: datetime
    responded_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Trainee data view (read-only, returned to coach)
# ---------------------------------------------------------------------------

class TraineeSyncBuckets(BaseModel):
    """Subset of user_data buckets a coach is authorised to read."""
    tracker: Optional[str] = None
    history: Optional[str] = None
    meals: Optional[str] = None
    body: Optional[str] = None
    personal_plan: Optional[str] = None
    updated_at: Optional[datetime] = None
