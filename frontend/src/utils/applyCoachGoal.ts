/**
 * Apply an accepted coaching goal into the same local stores the daily
 * tracker and settings UI already read, then notify listeners + sync.
 */
import { DEFAULT_MACRO_TARGETS, type MacroTargets } from "../hooks/useUserSettings";
import { schedulePush } from "../services/sync";
import type { CoachingGoal } from "../services/coachApi";
import type { DailyTrackerState } from "../types";
import { todayStr } from "./date";

export const COACH_GOAL_APPLIED_EVENT = "calorie-coach-goal-applied";

const trackerKey = (uid: string) => `user_${uid}:dailyTracker:v1`;
const SETTINGS_KEY = "app:settings:v1";

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

function notify(userId: string): void {
  window.dispatchEvent(
    new CustomEvent(COACH_GOAL_APPLIED_EVENT, { detail: { userId } })
  );
}

export function applyCoachGoal(userId: string, goal: CoachingGoal): void {
  const value = Math.max(0, Math.floor(goal.target_value));
  if (!Number.isFinite(value) || value <= 0) return;

  if (goal.goal_type === "calories" || goal.goal_type === "steps") {
    const today = todayStr();
    const prev = readJson<DailyTrackerState>(trackerKey(userId));
    const base: DailyTrackerState =
      prev && prev.date === today
        ? prev
        : {
            date: today,
            targetCalories: prev?.targetCalories ?? 2000,
            entries: prev?.date === today ? prev.entries : [],
            ...(prev?.stepsToday != null ? { stepsToday: prev.stepsToday } : {}),
            ...(prev?.stepsGoal != null ? { stepsGoal: prev.stepsGoal } : {}),
          };

    if (goal.goal_type === "calories") {
      writeJson(trackerKey(userId), { ...base, targetCalories: value });
    } else {
      writeJson(trackerKey(userId), { ...base, stepsGoal: value });
    }
  } else if (
    goal.goal_type === "protein" ||
    goal.goal_type === "carbs" ||
    goal.goal_type === "fat"
  ) {
    const settings = readJson<{ macroTargets?: MacroTargets; theme?: string }>(SETTINGS_KEY) ?? {};
    const macros = { ...(settings.macroTargets ?? DEFAULT_MACRO_TARGETS) };
    if (goal.goal_type === "protein") macros.protein = value;
    if (goal.goal_type === "carbs") macros.carbs = value;
    if (goal.goal_type === "fat") macros.fat = value;
    writeJson(SETTINGS_KEY, { ...settings, macroTargets: macros });
  }

  schedulePush(userId);
  notify(userId);
}
