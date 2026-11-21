import { describe, expect, it } from "vitest";
import type { AnalyzeResponse, IngredientRowState } from "../types";
import { EMPTY_NUTRITION } from "../types";
import { patchFromAnalyze, rowCountsTowardMeal } from "./nutritionTrust";

function row(patch: Partial<IngredientRowState>): IngredientRowState {
  return {
    id: "r",
    name: "חלב",
    quantity: 100,
    unit: "גרם",
    nutritionPer100g: { ...EMPTY_NUTRITION, calories: 60 },
    quantityInGrams: 100,
    nutritionForQuantity: { ...EMPTY_NUTRITION, calories: 60 },
    confidence: 0.95,
    source: "local",
    matchedName: "חלב",
    status: "ready",
    showEditor: false,
    manualEdit: false,
    ...patch,
  };
}

function response(patch: Partial<AnalyzeResponse>): AnalyzeResponse {
  return {
    ingredient_name: "קולה",
    nutrition_per_100g: { ...EMPTY_NUTRITION, calories: 42, carbohydrates: 10.6 },
    nutrition_for_quantity: { ...EMPTY_NUTRITION, calories: 42, carbohydrates: 10.6 },
    quantity_in_grams: 100,
    confidence: 0.95,
    source: "local",
    matched_name: "קולה",
    needs_confirmation: false,
    ...patch,
  };
}

describe("rowCountsTowardMeal", () => {
  it("counts an exact ready match", () => {
    expect(rowCountsTowardMeal(row({}))).toBe(true);
  });

  it("does not count a suggestion waiting for confirmation", () => {
    expect(rowCountsTowardMeal(row({ pendingConfirmation: true }))).toBe(false);
  });

  it("does not count an unresolved lookup", () => {
    expect(rowCountsTowardMeal(row({ unresolved: true, nutritionPer100g: { ...EMPTY_NUTRITION } }))).toBe(false);
  });
});

describe("patchFromAnalyze", () => {
  it("applies an exact local hit immediately", () => {
    const patch = patchFromAnalyze(response({}));
    expect(patch.pendingConfirmation).toBe(false);
    expect(patch.unresolved).toBe(false);
    expect(patch.nutritionPer100g?.calories).toBe(42);
  });

  it("holds an AI estimate until confirmation", () => {
    const patch = patchFromAnalyze(
      response({ source: "ai_estimate", confidence: 0.5, needs_confirmation: true })
    );
    expect(patch.pendingConfirmation).toBe(true);
    expect(patch.nutritionPer100g?.calories).toBe(42);
  });

  it("does not store a failed lookup as zero calories", () => {
    const patch = patchFromAnalyze(
      response({
        source: "unknown",
        confidence: 0,
        needs_confirmation: false,
        nutrition_per_100g: { ...EMPTY_NUTRITION },
      })
    );
    expect(patch.unresolved).toBe(true);
    expect(patch.pendingConfirmation).toBe(false);
    expect(patch.nutritionPer100g?.calories).toBe(0);
    expect(patch.source).toBe("unknown");
  });
});
