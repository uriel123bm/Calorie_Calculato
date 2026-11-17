/**
 * Single source of truth for recipe-level nutrition math on the client.
 * Mirrors backend `app/services/calculator.py` + `unit_converter.to_grams` for gram-based rows.
 */
import type { HebrewUnit, NutritionPer100g, UserProduct } from "../types";
import { EMPTY_NUTRITION } from "../types";

export const NUTRITION_FIELDS = [
  "calories",
  "protein",
  "carbohydrates",
  "sugar",
  "fat",
  "sodium",
] as const satisfies readonly (keyof NutritionPer100g)[];

export type NutritionField = (typeof NUTRITION_FIELDS)[number];

export function gramsFromUnit(
  quantity: number,
  unit: HebrewUnit,
  unitWeightG?: number
): number {
  switch (unit) {
    case "גרם":
    case 'מ"ל':
      return quantity;
    case "קילוגרם":
    case "ליטר":
      return quantity * 1000;
    case "כף":
      return quantity * 15;
    case "כפית":
      return quantity * 5;
    case "כוס":
      return quantity * 240;
    case "יחידה":
      return quantity * (unitWeightG && unitWeightG > 0 ? unitWeightG : 100);
  }
}

/** Clamp to a non-negative finite number (NaN / ±Infinity / negatives → 0). */
export function nonNegativeFinite(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function scaleNutrition(per100g: NutritionPer100g, grams: number): NutritionPer100g {
  if (grams <= 0) return { ...EMPTY_NUTRITION };
  const factor = grams / 100;
  return NUTRITION_FIELDS.reduce((acc, key) => {
    acc[key] = per100g[key] * factor;
    return acc;
  }, {} as NutritionPer100g);
}

export function sumNutrition(items: NutritionPer100g[]): NutritionPer100g {
  return items.reduce((acc, item) => {
    NUTRITION_FIELDS.forEach((k) => {
      acc[k] += item[k];
    });
    return acc;
  }, { ...EMPTY_NUTRITION });
}

/** Weighted per-100g for a mixture (same as `calculator.per_100g`). */
export function aggregatePer100g(total: NutritionPer100g, totalGrams: number): NutritionPer100g {
  if (totalGrams <= 0) return { ...EMPTY_NUTRITION };
  const factor = 100 / totalGrams;
  return NUTRITION_FIELDS.reduce((acc, key) => {
    acc[key] = (total[key] * factor);
    return acc;
  }, {} as NutritionPer100g);
}

/** Same as `calculator.per_serving`. */
export function divideTotalsByServings(total: NutritionPer100g, servings: number): NutritionPer100g {
  if (servings <= 0) return { ...EMPTY_NUTRITION };
  return NUTRITION_FIELDS.reduce((acc, key) => {
    acc[key] = total[key] / servings;
    return acc;
  }, {} as NutritionPer100g);
}

/** Macros stored per serving on `UserProduct` — linear scale by quantity / servingValue. */
export interface Macros4 {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
}

export function scaleServingMacros(product: UserProduct, quantity: number): Macros4 {
  if (product.servingValue <= 0 || quantity <= 0) {
    return { calories: 0, protein: 0, carbohydrates: 0, fat: 0 };
  }
  const f = quantity / product.servingValue;
  return {
    calories: product.calories * f,
    protein: product.protein * f,
    carbohydrates: product.carbohydrates * f,
    fat: product.fat * f,
  };
}

/** Progress percentage for bars: 0 when there is no positive target, capped at 100. */
export function progressPercent(value: number, target: number): number {
  if (!(target > 0) || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, (value / target) * 100));
}

/**
 * Totals for a diary entry built from already-rounded lines, so the entry
 * always equals the sum of the breakdown the user sees.
 */
export function sumEntryLines(lines: Macros4[]): Macros4 {
  const sum = lines.reduce(
    (acc, l) => ({
      calories: acc.calories + l.calories,
      protein: acc.protein + l.protein,
      carbohydrates: acc.carbohydrates + l.carbohydrates,
      fat: acc.fat + l.fat,
    }),
    { calories: 0, protein: 0, carbohydrates: 0, fat: 0 }
  );
  const tidy = (n: number) => Math.round(n * 10) / 10;
  return {
    calories: Math.round(sum.calories),
    protein: tidy(sum.protein),
    carbohydrates: tidy(sum.carbohydrates),
    fat: tidy(sum.fat),
  };
}
