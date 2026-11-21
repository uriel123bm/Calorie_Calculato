import type { AnalyzeResponse, IngredientRowState, NutritionPer100g } from "../types";
import { EMPTY_NUTRITION } from "../types";

/** A row enters the meal total only after a trusted match or an explicit confirm. */
export function rowCountsTowardMeal(row: IngredientRowState): boolean {
  if (row.pendingConfirmation || row.unresolved) return false;
  if (row.status !== "ready" && !row.manualEdit) return false;
  return row.quantityInGrams > 0;
}

export function patchFromAnalyze(res: AnalyzeResponse): Partial<IngredientRowState> {
  const unresolved = res.confidence <= 0 || res.source === "unknown";
  if (unresolved) {
    return {
      nutritionPer100g: { ...EMPTY_NUTRITION },
      confidence: 0,
      source: "unknown",
      matchedName: res.matched_name,
      status: "ready",
      pendingConfirmation: false,
      unresolved: true,
      manualEdit: false,
    };
  }
  const pending = Boolean(res.needs_confirmation) || res.source === "ai_estimate";
  return {
    nutritionPer100g: res.nutrition_per_100g,
    confidence: res.confidence,
    source: res.source,
    matchedName: res.matched_name,
    status: "ready",
    pendingConfirmation: pending,
    unresolved: false,
    manualEdit: false,
  };
}

export function clearedNutrition(): NutritionPer100g {
  return { ...EMPTY_NUTRITION };
}
