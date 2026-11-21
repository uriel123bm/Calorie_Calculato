"""Hebrew staple bench: bands and whether the hit may enter a total immediately."""

from __future__ import annotations

import pytest

from app.services.nutrition_lookup import (
    OFF_MIN_SCORE,
    OFF_STRONG_SCORE,
    _local_lookup,
    off_suggestion,
)
from app.services.nutrition_sanity import macros_implausible
from app.models.ingredient import NutritionPer100g


@pytest.mark.parametrize(
    ("query", "kcal_min", "kcal_max", "protein_max", "needs_confirmation"),
    [
        ("קולה", 20, 55, 1, False),
        ("חלב", 40, 80, 8, False),
        ("מים", 0, 2, 1, False),
        ("שמן זית", 700, 920, 2, False),
        ("במבה", 480, 580, 20, False),
        ("תה", 0, 5, 1, False),
        ("אורז", 300, 400, 15, False),
        ("אורז לבן מבושל", 80, 200, 8, True),
        ("קוטג", 70, 160, 20, True),
    ],
)
def test_local_staple_band(
    query: str,
    kcal_min: float,
    kcal_max: float,
    protein_max: float,
    needs_confirmation: bool,
) -> None:
    hit = _local_lookup(query)
    assert hit is not None, query
    assert kcal_min <= hit.nutrition.calories <= kcal_max, (query, hit.matched_name, hit.nutrition.calories)
    assert hit.nutrition.protein <= protein_max, (query, hit.matched_name, hit.nutrition.protein)
    assert hit.needs_confirmation is needs_confirmation
    assert "חלבון" not in (hit.matched_name or "")
    assert "chocolat" not in (hit.matched_name or "").lower()


def test_off_suggestion_drops_unrelated_and_confirms_partial() -> None:
    assert off_suggestion(0.0) is None
    assert off_suggestion(OFF_MIN_SCORE - 0.01) is None
    weak = off_suggestion(0.42)
    assert weak is not None and weak[0] is True
    strong = off_suggestion(OFF_STRONG_SCORE)
    assert strong is not None and strong[0] is False


def test_atwater_rejects_snack_macros_with_drink_calories() -> None:
    bad = NutritionPer100g(calories=42, protein=12, carbohydrates=60, sugar=0, fat=10, sodium=5)
    assert macros_implausible(bad) is True


def test_atwater_accepts_oil_and_cottage() -> None:
    oil = NutritionPer100g(calories=884, protein=0, carbohydrates=0, sugar=0, fat=100, sodium=0)
    cottage = NutritionPer100g(calories=97, protein=10.1, carbohydrates=3, sugar=3, fat=5, sodium=350)
    assert macros_implausible(oil) is False
    assert macros_implausible(cottage) is False
