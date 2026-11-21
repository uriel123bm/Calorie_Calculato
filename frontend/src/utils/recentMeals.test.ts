import { describe, expect, it } from "vitest";
import type { DailyEntry } from "../types";
import { entryToDailyInput, recentMealsToRepeat } from "./recentMeals";

function meal(partial: Partial<DailyEntry> & Pick<DailyEntry, "id" | "name" | "addedAt">): DailyEntry {
  return {
    calories: 100,
    protein: 1,
    carbohydrates: 2,
    fat: 3,
    ...partial,
  };
}

describe("recentMealsToRepeat", () => {
  it("returns the four newest distinct meals, newest first", () => {
    const days = [
      {
        entries: [
          meal({ id: "old", name: "אורז", addedAt: 1 }),
          meal({ id: "water", name: "מים", addedAt: 5, calories: 0 }),
        ],
      },
      {
        entries: [
          meal({ id: "egg-old", name: "ביצה", addedAt: 2 }),
          meal({ id: "egg-new", name: "ביצה", addedAt: 8, calories: 90 }),
          meal({ id: "tuna", name: "טונה", addedAt: 7 }),
          meal({ id: "bread", name: "לחם", addedAt: 6 }),
          meal({ id: "yogurt", name: "יוגורט", addedAt: 4 }),
        ],
      },
    ];

    const names = recentMealsToRepeat(days).map((entry) => entry.id);
    expect(names).toEqual(["egg-new", "tuna", "bread", "water"]);
  });

  it("copies the logged macros, including a zero-calorie drink", () => {
    const entry = meal({ id: "w", name: "מים", addedAt: 1, calories: 0, protein: 0, fat: 0, carbohydrates: 0 });
    expect(entryToDailyInput(entry)).toMatchObject({ name: "מים", calories: 0, protein: 0 });
  });
});
