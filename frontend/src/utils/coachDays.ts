/**
 * Turns a trainee's synced tracker + history blobs into a date-keyed day map.
 *
 * History is stored as a DayLog array (`[{ date, entries, ... }]`). Older
 * builds sometimes wrote a `{ [date]: day }` object. Both shapes are accepted,
 * and the live tracker blob is overlaid on its own calendar date so "today"
 * is visible before midnight.
 */
import type { TraineeSyncBuckets } from "../services/coachApi";

export interface CoachMeal {
  name: string;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
}

export interface CoachDay {
  date: string;
  targetCalories: number;
  entries: CoachMeal[];
  stepsToday?: number;
  stepsGoal?: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeMeal(raw: unknown): CoachMeal | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const name =
    typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : "פריט";
  return {
    name,
    calories: num(entry.calories),
    protein: num(entry.protein),
    carbohydrates: num(entry.carbohydrates ?? entry.carbs),
    fat: num(entry.fat),
  };
}

function normalizeDay(raw: unknown, fallbackDate?: string): CoachDay | null {
  if (!raw || typeof raw !== "object") return null;
  const day = raw as Record<string, unknown>;
  const date = typeof day.date === "string" ? day.date : fallbackDate;
  if (!date || !ISO_DATE.test(date)) return null;
  const entries = (Array.isArray(day.entries) ? day.entries : [])
    .map(normalizeMeal)
    .filter((meal): meal is CoachMeal => meal != null);
  const stepsToday =
    typeof day.stepsToday === "number" && day.stepsToday >= 0
      ? Math.floor(day.stepsToday)
      : undefined;
  const stepsGoal =
    typeof day.stepsGoal === "number" && day.stepsGoal > 0
      ? Math.floor(day.stepsGoal)
      : undefined;
  return {
    date,
    targetCalories: Math.max(0, Math.floor(num(day.targetCalories))),
    entries,
    ...(stepsToday != null ? { stepsToday } : {}),
    ...(stepsGoal != null ? { stepsGoal } : {}),
  };
}

function putDay(map: Map<string, CoachDay>, day: CoachDay, preferEntries: boolean): void {
  const prev = map.get(day.date);
  if (!prev) {
    map.set(day.date, day);
    return;
  }
  map.set(day.date, {
    date: day.date,
    targetCalories: day.targetCalories || prev.targetCalories,
    entries: preferEntries ? day.entries : prev.entries.length > 0 ? prev.entries : day.entries,
    stepsToday: day.stepsToday ?? prev.stepsToday,
    stepsGoal: day.stepsGoal ?? prev.stepsGoal,
  });
}

export function parseCoachDays(
  sync: Pick<TraineeSyncBuckets, "history" | "tracker"> | null | undefined
): Map<string, CoachDay> {
  const map = new Map<string, CoachDay>();
  if (!sync) return map;

  if (sync.history) {
    try {
      const parsed = JSON.parse(sync.history) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const day = normalizeDay(item);
          if (day) putDay(map, day, false);
        }
      } else if (parsed && typeof parsed === "object") {
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          const withDate =
            value && typeof value === "object"
              ? { ...(value as Record<string, unknown>), date: (value as { date?: string }).date ?? key }
              : null;
          const day = normalizeDay(withDate, key);
          if (day) putDay(map, day, false);
        }
      }
    } catch {
      /* ignore malformed history */
    }
  }

  if (sync.tracker) {
    try {
      const day = normalizeDay(JSON.parse(sync.tracker) as unknown);
      if (day) putDay(map, day, true);
    } catch {
      /* ignore malformed tracker */
    }
  }

  return map;
}

export function coachDayHasData(day: CoachDay | undefined): boolean {
  if (!day) return false;
  return day.entries.length > 0 || (day.stepsToday ?? 0) > 0;
}

/** Local calendar date, `daysAgo` before today. */
export function localDateOffset(daysAgo: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function lastNDates(n: number, from = new Date()): string[] {
  const dates: string[] = [];
  for (let i = n - 1; i >= 0; i--) dates.push(localDateOffset(i, from));
  return dates;
}

export function sumMeals(entries: CoachMeal[]): {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
} {
  return entries.reduce(
    (sum, meal) => ({
      calories: sum.calories + meal.calories,
      protein: sum.protein + meal.protein,
      carbohydrates: sum.carbohydrates + meal.carbohydrates,
      fat: sum.fat + meal.fat,
    }),
    { calories: 0, protein: 0, carbohydrates: 0, fat: 0 }
  );
}
