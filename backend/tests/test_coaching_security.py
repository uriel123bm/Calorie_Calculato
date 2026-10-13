"""
Security regression tests for the coaching system.

These tests specifically target the attack vectors described in Phase 5 of the
implementation plan. They are separate from test_coaching.py to make it
easy to run security checks independently.

Every test verifies that an unauthorized request receives 401 or 403,
never 200 or 500.
"""
from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.main import create_app

app = create_app()
client = TestClient(app, raise_server_exceptions=True)


def _reg(suffix: str = "") -> dict:
    tag = f"{suffix}{uuid.uuid4().hex[:8]}"
    r = client.post(
        "/auth/register",
        json={"email": f"{tag}@sec-test.example.com", "username": tag, "password": "Secure!Pass1"},
    )
    assert r.status_code == 201, r.text
    d = r.json()
    return {"token": d["access_token"], "id": d["user"]["id"], "email": d["user"]["email"]}


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_coach(user: dict) -> None:
    r = client.post("/coach/profile", json={}, headers=_auth(user["token"]))
    assert r.status_code == 201


def _invite_and_accept(coach: dict, trainee: dict) -> str:
    r = client.post(
        "/coach/invitations",
        json={"trainee_email": trainee["email"]},
        headers=_auth(coach["token"]),
    )
    assert r.status_code == 201
    inv_id = r.json()["id"]
    r2 = client.post(
        f"/trainee/invitations/{inv_id}/accept",
        headers=_auth(trainee["token"]),
    )
    assert r2.status_code == 200
    return r2.json()["id"]


# ---------------------------------------------------------------------------
# 1. No token → 401
# ---------------------------------------------------------------------------

class TestUnauthenticatedRequests:
    def test_coach_profile_no_token(self) -> None:
        assert client.get("/coach/profile").status_code == 401

    def test_coach_trainees_no_token(self) -> None:
        assert client.get("/coach/trainees").status_code == 401

    def test_trainee_sync_no_token(self) -> None:
        fake_id = str(uuid.uuid4())
        assert client.get(f"/coach/trainees/{fake_id}/sync").status_code == 401

    def test_trainee_invitations_no_token(self) -> None:
        assert client.get("/trainee/invitations").status_code == 401

    def test_trainee_goals_no_token(self) -> None:
        assert client.get("/trainee/goals").status_code == 401


# ---------------------------------------------------------------------------
# 2. Valid token but no coach profile → 403
# ---------------------------------------------------------------------------

class TestNonCoachForbidden:
    def test_trainee_list_without_coach_profile(self) -> None:
        user = _reg("nc")
        assert client.get("/coach/trainees", headers=_auth(user["token"])).status_code == 403

    def test_send_invitation_without_coach_profile(self) -> None:
        user = _reg("nc")
        other = _reg("nc")
        r = client.post(
            "/coach/invitations",
            json={"trainee_email": other["email"]},
            headers=_auth(user["token"]),
        )
        assert r.status_code == 403

    def test_read_sync_without_coach_profile(self) -> None:
        user = _reg("nc")
        target = _reg("nc")
        r = client.get(f"/coach/trainees/{target['id']}/sync", headers=_auth(user["token"]))
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# 3. Coach cannot access a stranger's data (IDOR)
# ---------------------------------------------------------------------------

class TestIDORProtection:
    def test_coach_cannot_read_stranger_sync(self) -> None:
        coach = _reg("idor")
        stranger = _reg("idor")
        _make_coach(coach)
        r = client.get(
            f"/coach/trainees/{stranger['id']}/sync",
            headers=_auth(coach["token"]),
        )
        assert r.status_code == 403

    def test_coach_cannot_read_stranger_profile(self) -> None:
        coach = _reg("idor")
        stranger = _reg("idor")
        _make_coach(coach)
        r = client.get(
            f"/coach/trainees/{stranger['id']}/profile",
            headers=_auth(coach["token"]),
        )
        assert r.status_code == 403

    def test_coach_cannot_propose_goals_to_stranger(self) -> None:
        coach = _reg("idor")
        stranger = _reg("idor")
        _make_coach(coach)
        r = client.post(
            f"/coach/trainees/{stranger['id']}/goals",
            json={"goal_type": "calories", "target_value": 2000, "unit": "kcal"},
            headers=_auth(coach["token"]),
        )
        assert r.status_code == 403

    def test_coach_a_cannot_access_coach_b_trainee(self) -> None:
        coach_a = _reg("idor")
        coach_b = _reg("idor")
        trainee = _reg("idor")
        _make_coach(coach_a)
        _make_coach(coach_b)
        _invite_and_accept(coach_a, trainee)

        # coach_b has no relationship with trainee
        r = client.get(
            f"/coach/trainees/{trainee['id']}/sync",
            headers=_auth(coach_b["token"]),
        )
        assert r.status_code == 403

    def test_trainee_cannot_revoke_another_trainees_relationship(self) -> None:
        coach = _reg("idor")
        trainee1 = _reg("idor")
        trainee2 = _reg("idor")
        _make_coach(coach)
        rel_id = _invite_and_accept(coach, trainee1)

        # trainee2 tries to revoke trainee1's relationship
        r = client.post(
            f"/trainee/relationships/{rel_id}/revoke",
            headers=_auth(trainee2["token"]),
        )
        # Should be 404 (not found for this user), not 204
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# 4. Invitation acceptance by wrong user → 404
# ---------------------------------------------------------------------------

class TestInvitationOwnership:
    def test_wrong_user_cannot_accept_invitation(self) -> None:
        coach = _reg("inv")
        trainee = _reg("inv")
        other = _reg("inv")
        _make_coach(coach)

        r = client.post(
            "/coach/invitations",
            json={"trainee_email": trainee["email"]},
            headers=_auth(coach["token"]),
        )
        inv_id = r.json()["id"]

        # 'other' tries to accept an invitation sent to 'trainee'
        r2 = client.post(
            f"/trainee/invitations/{inv_id}/accept",
            headers=_auth(other["token"]),
        )
        assert r2.status_code == 404

    def test_wrong_user_cannot_reject_invitation(self) -> None:
        coach = _reg("inv")
        trainee = _reg("inv")
        other = _reg("inv")
        _make_coach(coach)

        r = client.post(
            "/coach/invitations",
            json={"trainee_email": trainee["email"]},
            headers=_auth(coach["token"]),
        )
        inv_id = r.json()["id"]

        r2 = client.post(
            f"/trainee/invitations/{inv_id}/reject",
            headers=_auth(other["token"]),
        )
        assert r2.status_code == 404

    def test_coach_cannot_cancel_another_coachs_invitation(self) -> None:
        coach_a = _reg("inv")
        coach_b = _reg("inv")
        trainee = _reg("inv")
        _make_coach(coach_a)
        _make_coach(coach_b)

        r = client.post(
            "/coach/invitations",
            json={"trainee_email": trainee["email"]},
            headers=_auth(coach_a["token"]),
        )
        inv_id = r.json()["id"]

        r2 = client.delete(
            f"/coach/invitations/{inv_id}",
            headers=_auth(coach_b["token"]),
        )
        assert r2.status_code == 404


# ---------------------------------------------------------------------------
# 5. Access is immediately cut after revocation
# ---------------------------------------------------------------------------

class TestAccessRevocation:
    def test_data_access_cut_immediately_on_revocation(self) -> None:
        coach = _reg("rev")
        trainee = _reg("rev")
        _make_coach(coach)
        _invite_and_accept(coach, trainee)

        # Coach can read data
        r1 = client.get(
            f"/coach/trainees/{trainee['id']}/sync",
            headers=_auth(coach["token"]),
        )
        assert r1.status_code == 200

        # Trainee revokes
        rels = client.get("/trainee/relationships", headers=_auth(trainee["token"])).json()
        rel_id = rels[0]["id"]
        client.post(f"/trainee/relationships/{rel_id}/revoke", headers=_auth(trainee["token"]))

        # Coach is now blocked
        r2 = client.get(
            f"/coach/trainees/{trainee['id']}/sync",
            headers=_auth(coach["token"]),
        )
        assert r2.status_code == 403
