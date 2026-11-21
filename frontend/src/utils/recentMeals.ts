import type { DailyEntry, DailyEntryInput } from "../types";

function mealKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("he-IL");
}

/** Newest distinct meals across the journal, for a one-tap repeat. */
export function recentMealsToRepeat(
  days: Array<{ entries: DailyEntry[] }>,
  limit = 4,
): DailyEntry[] {
  const sorted = days
    .flatMap((day) => day.entries)
    .filter((entry) => entry.name.trim().length > 0)
    .sort((a, b) => b.addedAt - a.addedAt);
  const seen = new Set<string>();
  const out: DailyEntry[] = [];
  for (const entry of sorted) {
    const key = mealKey(entry.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}

export function entryToDailyInput(entry: DailyEntry): DailyEntryInput {
  return {
    name: entry.name,
    calories: entry.calories,
    protein: entry.protein,
    carbohydrates: entry.carbohydrates,
    fat: entry.fat,
    mealType: entry.mealType,
    lines: entry.lines,
  };
}
