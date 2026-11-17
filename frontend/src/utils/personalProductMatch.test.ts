import { describe, expect, it } from "vitest";
import type { UserProduct } from "../types";
import { gramsFromUnit, scaleNutrition } from "./nutritionMath";
import { personalProductToIngredientRow } from "./personalProductMatch";

const base: UserProduct = {
  id: "p", name: "יוגורט", servingValue: 1, servingUnit: "יחידה", servingsCount: 1,
  calories: 1000, protein: 50, carbohydrates: 100, fat: 40, addedAt: 0,
};

function caloriesFor(p: UserProduct, quantity: number, unit: "יחידה" | "גרם") {
  const row = personalProductToIngredientRow(p);
  const grams = gramsFromUnit(quantity, unit, row.unitWeightG);
  return scaleNutrition(row.nutritionPer100g, grams).calories;
}

describe("personalProductToIngredientRow", () => {
  it("uses real per-100g values when the product has them (500 g pack, 200 kcal/100 g)", () => {
    const pack: UserProduct = {
      ...base,
      per100g: { calories: 200, protein: 10, carbohydrates: 20, fat: 8 },
      packageGrams: 500,
    };
    expect(caloriesFor(pack, 1, "יחידה")).toBeCloseTo(1000);
    expect(caloriesFor(pack, 100, "גרם")).toBeCloseTo(200);
    expect(caloriesFor(pack, 250, "גרם")).toBeCloseTo(500);
  });

  it("splits a multi-portion package into per-unit weight", () => {
    const multi: UserProduct = {
      ...base, servingsCount: 4, calories: 250,
      per100g: { calories: 200, protein: 10, carbohydrates: 20, fat: 8 },
      packageGrams: 500,
    };
    expect(caloriesFor(multi, 1, "יחידה")).toBeCloseTo(250);
    expect(caloriesFor(multi, 50, "גרם")).toBeCloseTo(100);
  });

  it("keeps the per-unit behaviour for products without gram data", () => {
    expect(caloriesFor(base, 1, "יחידה")).toBeCloseTo(1000);
    expect(caloriesFor(base, 2, "יחידה")).toBeCloseTo(2000);
  });
});
