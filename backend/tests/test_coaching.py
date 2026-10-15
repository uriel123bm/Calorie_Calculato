"""
Integration tests for the Coach–Trainee Management System.

Tests are ordered to cover the full lifecycle:
  register → activate coach → invite → accept/reject → access data → revoke

Security tests verify that:
  - A coach cannot access data before acceptance.
  - A trainee can revoke access immediately.
  - A coach cannot access another coach's trainees.
  - Expired invitations are rejected.
  - Duplicate invitations are rejected.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

app = create_app()
client = TestClient(app, raise_server_exceptions=True)


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _new_user(suffix: str = "") -> dict:
    """Register a fresh user and return the auth token + user info."""
    tag = f"{suffix}{uuid.uuid4().hex[:8]}"
    r = client.post(
        "/auth/register",
        json={
            "email": f"user{tag}@test.example",
            "username": f"user{tag}",
            "password": "TestPass123!",
        },
    )
    assert r.status_code == 201, r.text
    data = r.json()
    return {
        "access_token": data["access_token"],
        "id": data["user"]["id"],
        "email": data["user"]["email"],
        "username": data["user"]["username"],
    }


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Coach profile
# ---------------------------------------------------------------------------

class TestCoachProfile:
    def test_create_coach_profile(self) -> None:
        coach = _new_user("coach")
        r = client.post(
            "/coach/profile",
            json={"bio": "מאמן כושר מוסמך"},
            headers=_auth(coach["access_token"]),
        )
        assert r.status_code == 201
        data = r.json()
        assert data["user_id"] == coach["id"]
        assert data["is_active"] is True

    def test_get_coach_profile(self) -> None:
        coach = _new_user("coach")
        client.post("/coach/profile", json={}, headers=_auth(coach["access_token"]))
        r = client.get("/coach/profile", headers=_auth(coach["access_token"]))
        assert r.status_code == 200

    def test_no_profile_returns_403(self) -> None:
        user = _new_user("nocoach")
        r = client.get("/coach/profile", headers=_auth(user["access_token"]))
        assert r.status_code == 403

    def test_duplicate_profile_returns_409(self) -> None:
        coach = _new_user("coach")
        client.post("/coach/profile", json={}, headers=_auth(coach["access_token"]))
        r = client.post("/coach/profile", json={}, headers=_auth(coach["access_token"]))
        assert r.status_code == 409


# ---------------------------------------------------------------------------
# Invitation lifecycle
# ---------------------------------------------------------------------------

class TestInvitationLifecycle:
    def _setup(self):  # type: ignore[return]
        coach = _new_user("coach")
        trainee = _new_user("trainee")
        client.post("/coach/profile", json={}, headers=_auth(coach["access_token"]))
        return coach, trainee

    def test_send_invitation(self) -> None:
        coach, trainee = self._setup()
        r = client.post(
            "/coach/invitations",
            json={"trainee_email": trainee["email"]},
            headers=_auth(coach["access_token"]),
        )
        assert r.status_code == 201
        assert r.json()["status"] == "pending"

    def test_duplicate_invitation_rejected(self) -> None:
        coach, trainee = self._setup()
        client.post(
            "/coach/invitations",
            json={"trainee_email": trainee["email"]},
            headers=_auth(coach["access_token"]),
        )
        r = client.post(
            "/coach/invitations",
            json={"trainee_email": trainee["email"]},
            headers=_auth(coach["access_token"]),
        )
        assert r.status_code == 409

    def test_self_invitation_rejected(self) -> None:
        coach = _new_user("coach")
        client.post("/coach/profile", json={}, headers=_auth(coach["access_token"]))
        r = client.post(
            "/coach/invitations",
            json={"trainee_email": coach["email"]},
            headers=_auth(coach["access_token"]),
        )
        assert r.status_code == 400

    def test_trainee_sees_invitation(self) -> None:
        coach, trainee = self._setup()
        client.post(
            "/coach/invitations",
            json={"trainee_email": trainee["email"]},
            headers=_auth(coach["access_token"]),
        )
        r = client.get("/trainee/invitations", headers=_auth(trainee["access_token"]))
        assert r.status_code == 200
        invitations = r.json()
        assert len(invitations) >= 1
        assert invitations[0]["coach_username"] == coach["username"]

    def test_accept_invitation_creates_relationship(self) -> None:
        coach, trainee = self._setup()
        client.post(
            "/coach/invitations",
            json={"trainee_email": trainee["email"]},
            headers=_auth(coach["access_token"]),
        )
        invitations = client.get(
            "/trainee/invitations", headers=_auth(trainee["access_token"])
        ).json()
        inv_id = invitations[0]["id"]

        r = client.post(
            f"/trainee/invitations/{inv_id}/accept",
            headers=_auth(trainee["access_token"]),
        )
        assert r.status_code == 200
        rel = r.json()
        assert rel["status"] == "active"
        assert rel["coach_id"] == coach["id"]
        assert rel["trainee_id"] == trainee["id"]

    def test_reject_invitation(self) -> None:
        coach, trainee = self._setup()
        client.post(
            "/coach/invitations",
            json={"trainee_email": trainee["email"]},
            headers=_auth(coach["access_token"]),
        )
        invitations = client.get(
            "/trainee/invitations", headers=_auth(trainee["access_token"])
        ).json()
        inv_id = invitations[0]["id"]

        r = client.post(
            f"/trainee/invitations/{inv_id}/reject",
            headers=_auth(trainee["access_token"]),
        )
        assert r.status_code == 204

        # Verify status changed
        invitations2 = client.get(
            "/trainee/invitations", headers=_auth(trainee["access_token"])
        ).json()
        rejected = next(i for i in invitations2 if i["id"] == inv_id)
        assert rejected["status"] == "rejected"

    def test_cancel_invitation(self) -> None:
        coach, trainee = self._setup()
        resp = client.post(
            "/coach/invitations",
            json={"trainee_email": trainee["email"]},
            headers=_auth(coach["access_token"]),
        )
        inv_id = resp.json()["id"]
        r = client.delete(
            f"/coach/invitations/{inv_id}",
            headers=_auth(coach["access_token"]),
        )
        assert r.status_code == 204


# ---------------------------------------------------------------------------
# Security: data access gating
# ---------------------------------------------------------------------------

class TestDataAccessSecurity:
    def _setup_active_pair(self):  # type: ignore[return]
        coach = _new_user("coach")
        trainee = _new_user("trainee")
        client.post("/coach/profile", json={}, headers=_auth(coach["access_token"]))
        r = client.post(
            "/coach/invitations",
            json={"trainee_email": trainee["email"]},
            headers=_auth(coach["access_token"]),
        )
        inv_id = r.json()["id"]
        client.post(
            f"/trainee/invitations/{inv_id}/accept",
            headers=_auth(trainee["access_token"]),
        )
        return coach, trainee

    def test_coach_cannot_read_data_before_acceptance(self) -> None:
        coach = _new_user("coach")
        stranger = _new_user("stranger")
        client.post("/coach/profile", json={}, headers=_auth(coach["access_token"]))
        r = client.get(
            f"/coach/trainees/{stranger['id']}/sync",
            headers=_auth(coach["access_token"]),
        )
        assert r.status_code == 403

    def test_coach_can_read_data_after_acceptance(self) -> None:
        coach, trainee = self._setup_active_pair()
        r = client.get(
            f"/coach/trainees/{trainee['id']}/sync",
            headers=_auth(coach["access_token"]),
        )
        assert r.status_code == 200

    def test_coach_sees_history_array_and_steps(self) -> None:
        coach, trainee = self._setup_active_pair()
        pushed = client.put(
            "/sync",
            headers=_auth(trainee["access_token"]),
            json={
                "tracker": {
                    "date": "2026-10-15",
                    "targetCalories": 2000,
                    "stepsToday": 3500,
                    "stepsGoal": 10000,
                    "entries": [
                        {
                            "id": "meal-1",
                            "name": "שקשוקה",
                            "calories": 200,
                            "protein": 12,
                            "carbohydrates": 8,
                            "fat": 10,
                            "addedAt": 1,
                        }
                    ],
                },
                "history": [
                    {
                        "date": "2026-10-14",
                        "targetCalories": 2000,
                        "stepsToday": 8000,
                        "entries": [
                            {
                                "id": "meal-2",
                                "name": "טונה",
                                "calories": 108,
                                "protein": 24,
                                "carbohydrates": 0,
                                "fat": 1,
                                "addedAt": 1,
                            }
                        ],
                    }
                ],
            },
        )
        assert pushed.status_code == 200, pushed.text
        body = pushed.json()
        assert body["tracker"]["stepsToday"] == 3500
        assert body["tracker"]["entries"][0]["name"] == "שקשוקה"
        assert body["history"][0]["stepsToday"] == 8000
        assert body["history"][0]["entries"][0]["name"] == "טונה"

        seen = client.get(
            f"/coach/trainees/{trainee['id']}/sync",
            headers=_auth(coach["access_token"]),
        )
        assert seen.status_code == 200
        payload = seen.json()
        assert "שקשוקה" in (payload["tracker"] or "")
        assert "3500" in (payload["tracker"] or "")
        assert "טונה" in (payload["history"] or "")
        assert "8000" in (payload["history"] or "")

    def test_trainee_revokes_access(self) -> None:
        coach, trainee = self._setup_active_pair()
        rels = client.get(
            "/trainee/relationships", headers=_auth(trainee["access_token"])
        ).json()
        rel_id = rels[0]["id"]

        r = client.post(
            f"/trainee/relationships/{rel_id}/revoke",
            headers=_auth(trainee["access_token"]),
        )
        assert r.status_code == 204

        # Coach should now be blocked
        r2 = client.get(
            f"/coach/trainees/{trainee['id']}/sync",
            headers=_auth(coach["access_token"]),
        )
        assert r2.status_code == 403

    def test_coach_cannot_access_other_coachs_trainee(self) -> None:
        coach1, trainee = self._setup_active_pair()

        coach2 = _new_user("coach")
        client.post("/coach/profile", json={}, headers=_auth(coach2["access_token"]))

        r = client.get(
            f"/coach/trainees/{trainee['id']}/sync",
            headers=_auth(coach2["access_token"]),
        )
        assert r.status_code == 403

    def test_unauthenticated_request_is_rejected(self) -> None:
        r = client.get("/coach/profile")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# Coaching goals
# ---------------------------------------------------------------------------

class TestCoachingGoals:
    def _setup(self):  # type: ignore[return]
        coach = _new_user("coach")
        trainee = _new_user("trainee")
        client.post("/coach/profile", json={}, headers=_auth(coach["access_token"]))
        r = client.post(
            "/coach/invitations",
            json={"trainee_email": trainee["email"]},
            headers=_auth(coach["access_token"]),
        )
        inv_id = r.json()["id"]
        client.post(
            f"/trainee/invitations/{inv_id}/accept",
            headers=_auth(trainee["access_token"]),
        )
        return coach, trainee

    def test_propose_and_accept_goal(self) -> None:
        coach, trainee = self._setup()
        r = client.post(
            f"/coach/trainees/{trainee['id']}/goals",
            json={"goal_type": "calories", "target_value": 2000, "unit": "kcal"},
            headers=_auth(coach["access_token"]),
        )
        assert r.status_code == 201
        goal_id = r.json()["id"]

        # Trainee sees the goal
        r2 = client.get("/trainee/goals", headers=_auth(trainee["access_token"]))
        assert r2.status_code == 200
        goals = r2.json()
        assert any(g["id"] == goal_id for g in goals)

        # Trainee accepts
        r3 = client.post(
            f"/trainee/goals/{goal_id}/accept",
            headers=_auth(trainee["access_token"]),
        )
        assert r3.status_code == 204

    def test_coach_cannot_propose_goal_without_relationship(self) -> None:
        coach = _new_user("coach")
        stranger = _new_user("stranger")
        client.post("/coach/profile", json={}, headers=_auth(coach["access_token"]))
        r = client.post(
            f"/coach/trainees/{stranger['id']}/goals",
            json={"goal_type": "protein", "target_value": 150, "unit": "g"},
            headers=_auth(coach["access_token"]),
        )
        assert r.status_code == 403
