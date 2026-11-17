"""Regression tests for the /sync bucket validation."""
from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.main import create_app

client = TestClient(create_app(), raise_server_exceptions=True)


def _token() -> str:
    tag = uuid.uuid4().hex[:8]
    r = client.post(
        "/auth/register",
        json={"email": f"{tag}@sync-test.example.com", "username": f"s{tag}", "password": "Secure!Pass1"},
    )
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_settings_keep_macro_targets_across_devices() -> None:
    token = _token()
    settings = {"theme": "dark", "macroTargets": {"protein": 150, "carbs": 200, "fat": 60}}
    r = client.put("/sync", json={"settings": settings}, headers=_auth(token))
    assert r.status_code == 200, r.text

    other_device = client.get("/sync", headers=_auth(token)).json()
    assert other_device["settings"] == settings


def test_settings_drop_invalid_macro_targets() -> None:
    token = _token()
    r = client.put(
        "/sync",
        json={"settings": {"theme": "light", "macroTargets": {"protein": "x", "carbs": -5, "fat": 60}}},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["settings"] == {"theme": "light"}


def test_non_finite_nutrition_values_are_zeroed() -> None:
    token = _token()
    raw = (
        '{"tracker":{"date":"2026-11-17","targetCalories":2000,"entries":['
        '{"id":"e1","name":"x","calories":1e999,"protein":NaN,"carbohydrates":1,"fat":1}]}}'
    )
    r = client.put(
        "/sync", content=raw, headers={**_auth(token), "Content-Type": "application/json"}
    )
    assert r.status_code == 200, r.text
    entry = r.json()["tracker"]["entries"][0]
    assert entry["calories"] == 0
    assert entry["protein"] == 0
    assert client.get("/sync", headers=_auth(token)).status_code == 200


def test_deletion_markers_survive_the_server_round_trip() -> None:
    token = _token()
    tracker = {"date": "2026-11-17", "targetCalories": 2000, "entries": [], "deletedIds": ["gone", 5, ""]}
    history = [{"date": "2026-11-15", "targetCalories": 2000, "entries": [], "deletedIds": ["old"]}]
    r = client.put("/sync", json={"tracker": tracker, "history": history}, headers=_auth(token))
    assert r.status_code == 200, r.text
    body = client.get("/sync", headers=_auth(token)).json()
    assert body["tracker"]["deletedIds"] == ["gone"]
    assert body["history"][0]["deletedIds"] == ["old"]
