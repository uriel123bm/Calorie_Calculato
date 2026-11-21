"""Physical checks so a lookup is not presented as a real food value."""

from __future__ import annotations

from app.models.ingredient import NutritionPer100g

# Atwater factors (kcal per gram).
_P = 4.0
_C = 4.0
_F = 9.0


def atwater_kcal(nutrition: NutritionPer100g) -> float:
    return _P * nutrition.protein + _C * nutrition.carbohydrates + _F * nutrition.fat


def macros_implausible(nutrition: NutritionPer100g) -> bool:
    """True when the numbers cannot be a real per-100g food.

    A known zero-calorie item (water) is stored in the local catalog and never
    passes through this check. Empty AI/OFF rows and snack-like answers for a
    drink fail here.
    """
    expected = atwater_kcal(nutrition)
    kcal = nutrition.calories
    if kcal <= 0 and expected <= 5:
        return True
    if expected <= 0 and kcal > 40:
        return True
    if expected > 30 and kcal <= 0:
        return True
    if expected > 0 and kcal > 0:
        gap = abs(kcal - expected)
        ratio = kcal / expected
        if gap > 40 and (ratio < 0.55 or ratio > 1.8):
            return True
    return False
