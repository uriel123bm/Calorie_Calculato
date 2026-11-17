import type { HebrewUnit, NutritionPer100g, UserProduct } from "../types";
import { EMPTY_NUTRITION } from "../types";
import { gramsFromUnit, scaleServingMacros } from "./nutritionMath";

/** Normalize for loose equality (trim, collapse spaces). */
export function normalizeProductLabel(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/**
 * Exact match on normalized names (case-sensitive for Hebrew;
 * compares ASCII segments case-insensitively when overlapping).
 */
export function findPersonalProductByName(
  rawName: string,
  products: UserProduct[]
): UserProduct | null {
  const needle = normalizeProductLabel(rawName);
  if (!needle) return null;
  const lowerNeedle = needle.toLocaleLowerCase("he-IL");
  return (
    products.find((p) => normalizeProductLabel(p.name) === needle) ??
    products.find((p) => normalizeProductLabel(p.name).toLocaleLowerCase("he-IL") === lowerNeedle) ??
    null
  );
}

/** Macro totals for exactly `quantity` in the product's serving basis (same units as saved). */
export function totalsForProductQuantity(p: UserProduct, quantity: number) {
  return scaleServingMacros(p, quantity);
}

/**
 * Convert a saved personal product into per-100g nutrition plus a unit weight
 * for an ingredient row (quantity 1 × "יחידה").
 *
 * When the product carries real per-100g data, the row uses it and derives the
 * grams-per-unit from the stored per-unit calories, so "1 unit" keeps matching
 * the library totals while switching the row to grams stays accurate.
 * Without gram data, a unit is the app's default 100 g and per-unit macros are
 * scaled into that basis.
 */
export function personalProductToIngredientRow(
  p: UserProduct
): { nutritionPer100g: NutritionPer100g; unitWeightG?: number } {
  const real = p.per100g;
  if (real && real.calories > 0 && p.calories > 0) {
    const perUnit = scaleServingMacros(p, 1);
    return {
      nutritionPer100g: { ...real, sugar: 0, sodium: 0 },
      unitWeightG: (perUnit.calories / real.calories) * 100,
    };
  }
  return { nutritionPer100g: personalProductToIngredientPer100g(p) };
}

function personalProductToIngredientPer100g(p: UserProduct): NutritionPer100g {
  const unit = p.servingUnit as HebrewUnit;
  const qty = p.servingValue;
  const grams = gramsFromUnit(qty, unit);
  if (grams <= 0) return { ...EMPTY_NUTRITION };
  const t = scaleServingMacros(p, qty);
  const f = 100 / grams;
  return {
    calories: t.calories * f,
    protein: t.protein * f,
    carbohydrates: t.carbohydrates * f,
    sugar: 0,
    fat: t.fat * f,
    sodium: 0,
  };
}
