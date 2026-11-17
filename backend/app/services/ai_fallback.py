"""AI-powered nutrition estimator (final fallback).

Uses OpenAI's chat completions with JSON mode. If the API key is missing or
the call fails, returns a low-confidence zero result rather than raising,
so the API can still respond gracefully.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import re
from dataclasses import dataclass

from app.core.config import settings
from app.models.ingredient import NutritionPer100g, NutritionSource


logger = logging.getLogger(__name__)


@dataclass
class AIEstimate:
    nutrition: NutritionPer100g
    confidence: float
    source: NutritionSource
    matched_name: str


_PROMPT_SYSTEM = (
    "You are a nutrition database for Israeli home cooking. Given a food or ingredient "
    "name (often Hebrew), output average nutrition values per 100 grams of edible portion "
    "(not packed weight of a boxed product unless the phrase clearly names a branded item). "
    "Respond ONLY with a JSON object, no commentary, with these numeric keys: "
    "calories (kcal), protein (g), carbohydrates (g), sugar (g), fat (g), sodium (mg). "
    "Use 0 only for genuinely unknown macros. "
    "If the ingredient can be bought dry/soaked vs cooked (e.g. grains, pulses, couscous vs "
    "pearled couscous cooked), prefer typical dry/unprepared edible numbers per 100g raw "
    "unless the wording explicitly mentions cooked/prepared/soaked (מבושל, מוכן, מוגש). "
    "Do not swap bulgur, couscous, rice, pasta, quinoa, or lentils for one another—they differ. "
    "Soft drinks and sodas (קולה, cola, ספרייט, פאנטה, סודה, משקה מוגז) are mostly water + sugar: "
    "typical regular cola is ~40 kcal and ~10 g carbs per 100 ml/g with ~0 g protein and ~0 g fat. "
    "Never invent snack/cereal macros (high protein/fat) for a soft drink name."
)

# Soft-drink phrases: AI sometimes invents snack-like macros (e.g. 12 g protein for cola).
_SOFT_DRINK_TOKENS = frozenset(
    {
        "קולה",
        "cola",
        "coke",
        "ספרייט",
        "sprite",
        "פאנטה",
        "fanta",
        "סודה",
        "soda",
        "גזוז",
        "מוגז",
        "זירו",
        "zero",
        "דיאט",
        "diet",
    }
)


def _looks_like_soft_drink(name: str) -> bool:
    tokens = {t for t in re.findall(r"[\w\u0590-\u05FF]+", name.lower()) if t}
    return bool(tokens & _SOFT_DRINK_TOKENS)


def _ai_macros_implausible_for_name(name: str, nutrition: NutritionPer100g) -> bool:
    """Reject known AI failure modes before auto-filling the diary."""
    if _looks_like_soft_drink(name):
        # Regular cola ~42 kcal / 0 protein; anything snack-like is a hallucination.
        if nutrition.protein >= 2 or nutrition.fat >= 2 or nutrition.calories >= 120:
            return True
    return False


def _build_user_prompt(ingredient_name: str) -> str:
    return (
        f"Ingredient phrase: {ingredient_name}\n"
        "Return JSON with keys only: calories, protein, carbohydrates, sugar, fat, sodium."
    )


def _zero_estimate(ingredient_name: str, source: NutritionSource = "ai_estimate") -> AIEstimate:
    return AIEstimate(
        nutrition=NutritionPer100g(),
        confidence=0.0,
        source=source,
        matched_name=ingredient_name,
    )


# Physical ceilings per 100 g (pure fat ≈ 900 kcal; table salt ≈ 39 g sodium).
_MAX_PER_100G = {
    "calories": 900.0,
    "protein": 100.0,
    "carbohydrates": 100.0,
    "sugar": 100.0,
    "fat": 100.0,
    "sodium": 40_000.0,
}


def _parse_response(text: str) -> NutritionPer100g:
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("AI response is not a JSON object")

    def _num(key: str) -> float:
        try:
            value = float(data.get(key, 0))
        except (TypeError, ValueError, OverflowError):
            return 0.0
        if not math.isfinite(value) or value < 0:
            return 0.0
        return min(value, _MAX_PER_100G[key])

    return NutritionPer100g(**{key: _num(key) for key in _MAX_PER_100G})


async def estimate(ingredient_name: str) -> AIEstimate:
    """Ask the AI provider for a nutrition estimate."""
    if not settings.openai_api_key:
        logger.info("OPENAI_API_KEY not set; returning zero AI estimate.")
        return _zero_estimate(ingredient_name, source="unknown")

    try:
        from openai import AsyncOpenAI
    except ImportError:
        logger.warning("openai package not installed; returning zero estimate.")
        return _zero_estimate(ingredient_name, source="unknown")

    client = AsyncOpenAI(api_key=settings.openai_api_key)

    try:
        response = await asyncio.wait_for(
            client.chat.completions.create(
                model=settings.openai_model,
                messages=[
                    {"role": "system", "content": _PROMPT_SYSTEM},
                    {"role": "user", "content": _build_user_prompt(ingredient_name)},
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
            ),
            timeout=15.0,
        )
    except (asyncio.TimeoutError, Exception) as exc:  # noqa: BLE001
        logger.warning("AI fallback failed for %r: %s", ingredient_name, exc)
        return _zero_estimate(ingredient_name)

    try:
        content = response.choices[0].message.content or "{}"
        nutrition = _parse_response(content)
    except (ValueError, KeyError, IndexError, AttributeError) as exc:
        logger.warning("AI response parse failed: %s", exc)
        return _zero_estimate(ingredient_name)

    if nutrition.calories <= 0 and nutrition.protein <= 0 and nutrition.carbohydrates <= 0 and nutrition.fat <= 0:
        return _zero_estimate(ingredient_name)

    if _ai_macros_implausible_for_name(ingredient_name, nutrition):
        logger.warning(
            "AI macros rejected as implausible for soft-drink-like name %r: %s",
            ingredient_name,
            nutrition,
        )
        return _zero_estimate(ingredient_name)

    return AIEstimate(
        nutrition=nutrition,
        confidence=0.5,
        source="ai_estimate",
        matched_name=ingredient_name,
    )
