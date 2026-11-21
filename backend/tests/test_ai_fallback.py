"""Validation of AI nutrition estimates before they reach users."""
from __future__ import annotations

import asyncio
import dataclasses
from types import SimpleNamespace

import pytest

from app.services import ai_fallback


def test_parse_clamps_values_to_physical_limits_per_100g() -> None:
    n = ai_fallback._parse_response(
        '{"calories": 50000, "protein": 300, "carbohydrates": 120, "sugar": 500, "fat": 101, "sodium": 900000}'
    )
    assert n.calories == 900
    assert n.protein == 100
    assert n.carbohydrates == 100
    assert n.sugar == 100
    assert n.fat == 100
    assert n.sodium == 40000


def test_parse_rejects_nan_negative_and_junk() -> None:
    n = ai_fallback._parse_response('{"calories": NaN, "protein": -4, "carbohydrates": "abc", "fat": Infinity}')
    assert (n.calories, n.protein, n.carbohydrates, n.fat) == (0, 0, 0, 0)


@pytest.mark.parametrize("payload", ["[]", '"text"', "null"])
def test_parse_non_object_response_is_an_error_not_a_crash(payload: str) -> None:
    with pytest.raises(ValueError):
        ai_fallback._parse_response(payload)


def _fake_openai(monkeypatch, content: str) -> None:
    class FakeClient:
        def __init__(self, **_):
            async def create(**_):
                return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])

            self.chat = SimpleNamespace(completions=SimpleNamespace(create=create))

    import openai

    monkeypatch.setattr(openai, "AsyncOpenAI", FakeClient)
    monkeypatch.setattr(ai_fallback, "settings", dataclasses.replace(ai_fallback.settings, openai_api_key="test"))


def test_estimate_with_list_response_returns_zero_confidence(monkeypatch) -> None:
    _fake_openai(monkeypatch, "[]")
    est = asyncio.run(ai_fallback.estimate("עגבניה"))
    assert est.confidence == 0
    assert est.nutrition.calories == 0


def test_estimate_with_all_zero_values_is_not_presented_as_confident(monkeypatch) -> None:
    _fake_openai(monkeypatch, '{"calories": 0, "protein": 0, "carbohydrates": 0, "fat": 0}')
    est = asyncio.run(ai_fallback.estimate("משהו לא ידוע"))
    assert est.confidence == 0


def test_soft_drink_ai_hallucination_with_high_protein_is_rejected(monkeypatch) -> None:
    """Cola is ~0 g protein / 100 g; snack-like AI answers must not be auto-filled."""
    _fake_openai(
        monkeypatch,
        '{"calories": 370, "protein": 12, "carbohydrates": 60, "sugar": 0, "fat": 6, "sodium": 5}',
    )
    est = asyncio.run(ai_fallback.estimate("קולה"))
    assert est.confidence == 0
    assert est.nutrition.protein == 0
    assert est.nutrition.calories == 0
