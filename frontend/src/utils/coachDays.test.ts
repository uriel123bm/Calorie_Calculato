import { describe, expect, it } from "vitest";
import { coachDayHasData, parseCoachDays } from "./coachDays";

describe("parseCoachDays", () => {
  it("reads history saved as an array of day logs", () => {
    const days = parseCoachDays({
      history: JSON.stringify([
        {
          date: "2026-10-14",
          targetCalories: 2000,
          entries: [{ name: "טונה", calories: 108, protein: 20, carbohydrates: 0, fat: 2 }],
          stepsToday: 4200,
        },
      ]),
      tracker: null,
    });

    const yesterday = days.get("2026-10-14");
    expect(yesterday?.entries).toHaveLength(1);
    expect(yesterday?.entries[0]?.name).toBe("טונה");
    expect(yesterday?.stepsToday).toBe(4200);
    expect(coachDayHasData(yesterday)).toBe(true);
  });

  it("still accepts a date-keyed history object", () => {
    const days = parseCoachDays({
      history: JSON.stringify({
        "2026-10-13": {
          targetCalories: 1800,
          entries: [{ name: "ביצה", calories: 90, protein: 7, carbs: 1, fat: 6 }],
        },
      }),
      tracker: null,
    });
    expect(days.get("2026-10-13")?.entries[0]?.carbohydrates).toBe(1);
    expect(days.get("2026-10-13")?.entries[0]?.calories).toBe(90);
  });

  it("overlays the live tracker on its own date, not on today", () => {
    const days = parseCoachDays({
      history: JSON.stringify([]),
      tracker: JSON.stringify({
        date: "2026-10-12",
        targetCalories: 2100,
        entries: [{ name: "שקשוקה", calories: 200, protein: 12, carbohydrates: 8, fat: 10 }],
        stepsToday: 900,
        stepsGoal: 8000,
      }),
    });

    expect(days.get("2026-10-15")).toBeUndefined();
    expect(days.get("2026-10-12")?.entries[0]?.name).toBe("שקשוקה");
    expect(days.get("2026-10-12")?.stepsGoal).toBe(8000);
  });

  it("prefers the live tracker meals when history also has that date", () => {
    const days = parseCoachDays({
      history: JSON.stringify([
        {
          date: "2026-10-15",
          targetCalories: 2000,
          entries: [{ name: "ישן", calories: 10, protein: 0, carbohydrates: 0, fat: 0 }],
        },
      ]),
      tracker: JSON.stringify({
        date: "2026-10-15",
        targetCalories: 2000,
        entries: [{ name: "חדש", calories: 300, protein: 20, carbohydrates: 10, fat: 5 }],
        stepsToday: 1500,
      }),
    });
    expect(days.get("2026-10-15")?.entries.map((e) => e.name)).toEqual(["חדש"]);
    expect(days.get("2026-10-15")?.stepsToday).toBe(1500);
  });

  it("lets an empty live tracker clear stale meals for the same date", () => {
    const days = parseCoachDays({
      history: JSON.stringify([
        {
          date: "2026-10-15",
          targetCalories: 2000,
          entries: [{ name: "ישן", calories: 10, protein: 0, carbohydrates: 0, fat: 0 }],
          stepsToday: 400,
        },
      ]),
      tracker: JSON.stringify({
        date: "2026-10-15",
        targetCalories: 2000,
        entries: [],
        stepsToday: 400,
      }),
    });
    expect(days.get("2026-10-15")?.entries).toEqual([]);
    expect(days.get("2026-10-15")?.stepsToday).toBe(400);
  });
});
