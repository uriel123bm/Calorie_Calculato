"""Regression tests for coach–trainee relationship lifecycle edge cases."""
from __future__ import annotations

import dataclasses
import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api.routes import coach as coach_routes
from app.db.database import SessionLocal
from app.db.models import PushSubscription
from app.main import create_app

client = TestClient(create_app(), raise_server_exceptions=True)


def _reg() -> dict:
    tag = uuid.uuid4().hex[:8]
    r = client.post(
        "/auth/register",
        json={"email": f"{tag}@life-test.example.com", "username": f"l{tag}", "password": "Secure!Pass1"},
    )
    assert r.status_code == 201, r.text
    d = r.json()
    return {"token": d["access_token"], "id": d["user"]["id"], "email": d["user"]["email"]}


def _auth(user: dict) -> dict:
    return {"Authorization": f"Bearer {user['token']}"}


def _invite(coach: dict, trainee: dict) -> str:
    r = client.post("/coach/invitations", json={"trainee_email": trainee["email"]}, headers=_auth(coach))
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _accept(trainee: dict, inv_id: str):
    return client.post(f"/trainee/invitations/{inv_id}/accept", headers=_auth(trainee))


@pytest.fixture()
def pair() -> tuple[dict, dict, str]:
    coach, trainee = _reg(), _reg()
    assert client.post("/coach/profile", json={}, headers=_auth(coach)).status_code == 201
    r = _accept(trainee, _invite(coach, trainee))
    assert r.status_code == 200, r.text
    return coach, trainee, r.json()["id"]


def test_trainee_can_reconnect_after_revoking(pair) -> None:
    coach, trainee, rel_id = pair
    assert client.post(f"/trainee/relationships/{rel_id}/revoke", headers=_auth(trainee)).status_code == 204
    assert client.get(f"/coach/trainees/{trainee['id']}/sync", headers=_auth(coach)).status_code == 403

    r = _accept(trainee, _invite(coach, trainee))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "active"
    assert r.json()["ended_at"] is None

    assert client.get(f"/coach/trainees/{trainee['id']}/sync", headers=_auth(coach)).status_code == 200
    trainees = client.get("/coach/trainees", headers=_auth(coach)).json()
    assert [t["trainee_id"] for t in trainees] == [trainee["id"]]
    active = [
        rel for rel in client.get("/trainee/relationships", headers=_auth(trainee)).json()
        if rel["status"] == "active"
    ]
    assert len(active) == 1


def test_trainee_can_reconnect_after_coach_deactivates_and_returns(pair) -> None:
    coach, trainee, _ = pair
    assert client.delete("/coach/profile", headers=_auth(coach)).status_code == 204
    assert client.post("/coach/profile", json={}, headers=_auth(coach)).status_code == 201

    r = _accept(trainee, _invite(coach, trainee))
    assert r.status_code == 200, r.text
    assert client.get(f"/coach/trainees/{trainee['id']}/profile", headers=_auth(coach)).status_code == 200


def test_goal_from_revoked_relationship_cannot_be_accepted(pair) -> None:
    coach, trainee, rel_id = pair
    g = client.post(
        f"/coach/trainees/{trainee['id']}/goals",
        json={"goal_type": "calories", "target_value": 1800},
        headers=_auth(coach),
    )
    assert g.status_code == 201, g.text
    assert client.post(f"/trainee/relationships/{rel_id}/revoke", headers=_auth(trainee)).status_code == 204

    assert client.post(f"/trainee/goals/{g.json()['id']}/accept", headers=_auth(trainee)).status_code == 404
    assert client.post(f"/trainee/goals/{g.json()['id']}/reject", headers=_auth(trainee)).status_code == 404


def test_stale_proposed_goal_is_not_revived_by_reconnecting(pair) -> None:
    coach, trainee, rel_id = pair
    g = client.post(
        f"/coach/trainees/{trainee['id']}/goals",
        json={"goal_type": "protein", "target_value": 140, "unit": "g"},
        headers=_auth(coach),
    ).json()
    client.post(f"/trainee/relationships/{rel_id}/revoke", headers=_auth(trainee))
    assert _accept(trainee, _invite(coach, trainee)).status_code == 200

    goals = client.get("/trainee/goals", headers=_auth(trainee)).json()
    assert {x["id"]: x["status"] for x in goals}[g["id"]] == "superseded"
    assert client.post(f"/trainee/goals/{g['id']}/accept", headers=_auth(trainee)).status_code == 404


def test_expired_push_subscriptions_are_pruned(pair, monkeypatch) -> None:
    coach, trainee, _ = pair
    db = SessionLocal()
    try:
        db.add(PushSubscription(user_id=trainee["id"], endpoint=f"https://push.example/{uuid.uuid4()}", p256dh="k", auth="a"))
        db.add(PushSubscription(user_id=trainee["id"], endpoint=f"https://push.example/{uuid.uuid4()}", p256dh="k", auth="a"))
        db.commit()
    finally:
        db.close()

    from pywebpush import WebPushException

    calls = {"n": 0}

    def fake_webpush(**kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise WebPushException("gone", response=SimpleNamespace(status_code=410))

    monkeypatch.setattr("pywebpush.webpush", fake_webpush)
    monkeypatch.setattr(
        coach_routes,
        "settings",
        dataclasses.replace(
            coach_routes.settings, vapid_private_key="test-key", vapid_subject="mailto:test@example.com"
        ),
    )

    r = client.post(
        f"/coach/trainees/{trainee['id']}/notify",
        json={"title": "hi", "body": "drink water"},
        headers=_auth(coach),
    )
    assert r.status_code == 204, r.text

    db = SessionLocal()
    try:
        remaining = db.query(PushSubscription).filter(PushSubscription.user_id == trainee["id"]).count()
    finally:
        db.close()
    assert remaining == 1


def test_coach_can_end_trainee_relationship_and_lose_data_access(pair) -> None:
    coach, trainee, rel_id = pair
    assert client.get(f"/coach/trainees/{trainee['id']}/sync", headers=_auth(coach)).status_code == 200

    assert client.post(f"/coach/relationships/{rel_id}/end", headers=_auth(coach)).status_code == 204
    assert client.get(f"/coach/trainees/{trainee['id']}/sync", headers=_auth(coach)).status_code == 403
    assert client.get("/coach/trainees", headers=_auth(coach)).json() == []

    # Trainee side also shows the relationship as no longer active.
    active = [
        rel for rel in client.get("/trainee/relationships", headers=_auth(trainee)).json()
        if rel["status"] == "active"
    ]
    assert active == []
    ended = [
        rel for rel in client.get("/trainee/relationships", headers=_auth(trainee)).json()
        if rel["id"] == rel_id
    ]
    assert ended and ended[0]["status"] == "ended"


def test_coach_can_reinvite_after_ending_relationship(pair) -> None:
    coach, trainee, rel_id = pair
    assert client.post(f"/coach/relationships/{rel_id}/end", headers=_auth(coach)).status_code == 204
    r = _accept(trainee, _invite(coach, trainee))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "active"
    assert client.get(f"/coach/trainees/{trainee['id']}/sync", headers=_auth(coach)).status_code == 200


def test_coach_can_remove_non_pending_invitation_from_list() -> None:
    coach, trainee = _reg(), _reg()
    assert client.post("/coach/profile", json={}, headers=_auth(coach)).status_code == 201
    inv_id = _invite(coach, trainee)
    assert client.post(f"/trainee/invitations/{inv_id}/reject", headers=_auth(trainee)).status_code == 204

    listed = client.get("/coach/invitations", headers=_auth(coach)).json()
    assert any(i["id"] == inv_id for i in listed)

    assert client.delete(f"/coach/invitations/{inv_id}", headers=_auth(coach)).status_code == 204
    listed_after = client.get("/coach/invitations", headers=_auth(coach)).json()
    assert all(i["id"] != inv_id for i in listed_after)


def test_coach_cancel_pending_invitation_still_soft_cancels() -> None:
    coach, trainee = _reg(), _reg()
    assert client.post("/coach/profile", json={}, headers=_auth(coach)).status_code == 201
    inv_id = _invite(coach, trainee)
    assert client.delete(f"/coach/invitations/{inv_id}", headers=_auth(coach)).status_code == 204
    listed = client.get("/coach/invitations", headers=_auth(coach)).json()
    match = next(i for i in listed if i["id"] == inv_id)
    assert match["status"] == "cancelled"


def test_coach_end_creates_notice_for_trainee(pair) -> None:
    coach, trainee, rel_id = pair
    assert client.post(f"/coach/relationships/{rel_id}/end", headers=_auth(coach)).status_code == 204

    notices = client.get("/coaching/access-notices", headers=_auth(trainee)).json()
    assert len(notices) == 1
    assert notices[0]["kind"] == "coach_removed"
    assert notices[0]["relationship_id"] == rel_id
    assert "הסיר אותך" in notices[0]["message"]
    assert client.get("/coaching/access-notices", headers=_auth(coach)).json() == []

    assert client.post(
        f"/coaching/access-notices/{notices[0]['id']}/ack", headers=_auth(trainee)
    ).status_code == 204
    assert client.get("/coaching/access-notices", headers=_auth(trainee)).json() == []


def test_trainee_revoke_creates_notice_for_coach(pair) -> None:
    coach, trainee, rel_id = pair
    assert client.post(f"/trainee/relationships/{rel_id}/revoke", headers=_auth(trainee)).status_code == 204

    notices = client.get("/coaching/access-notices", headers=_auth(coach)).json()
    assert len(notices) == 1
    assert notices[0]["kind"] == "trainee_revoked"
    assert "ביטל את הגישה" in notices[0]["message"]
    assert client.get("/coach/trainees", headers=_auth(coach)).json() == []


def test_coach_deactivate_notifies_trainees(pair) -> None:
    coach, trainee, rel_id = pair
    assert client.delete("/coach/profile", headers=_auth(coach)).status_code == 204
    notices = client.get("/coaching/access-notices", headers=_auth(trainee)).json()
    assert len(notices) == 1
    assert notices[0]["kind"] == "coach_removed"
    assert notices[0]["relationship_id"] == rel_id
