import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/sync", () => ({
  schedulePush: vi.fn(),
}));

import { schedulePush } from "../services/sync";
import { applyCoachGoal, COACH_GOAL_APPLIED_EVENT } from "./applyCoachGoal";
import type { CoachingGoal } from "../services/coachApi";

const UID = "user-1";

function goal(partial: Partial<CoachingGoal> & Pick<CoachingGoal, "goal_type" | "target_value">): CoachingGoal {
  return {
    id: "g1",
    relationship_id: "r1",
    unit: "kcal",
    status: "accepted",
    note: null,
    created_at: "2026-11-21T00:00:00Z",
    responded_at: null,
    ...partial,
  };
}

describe("applyCoachGoal", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(schedulePush).mockClear();
  });

  it("writes calorie target into today's tracker and notifies", () => {
    const events: string[] = [];
    const onEvent = (e: Event) => {
      events.push((e as CustomEvent).detail.userId);
    };
    window.addEventListener(COACH_GOAL_APPLIED_EVENT, onEvent);

    applyCoachGoal(UID, goal({ goal_type: "calories", target_value: 1850 }));

    const raw = JSON.parse(localStorage.getItem(`user_${UID}:dailyTracker:v1`)!);
    expect(raw.targetCalories).toBe(1850);
    expect(schedulePush).toHaveBeenCalledWith(UID);
    expect(events).toEqual([UID]);
    window.removeEventListener(COACH_GOAL_APPLIED_EVENT, onEvent);
  });

  it("updates only the matching macro in settings", () => {
    localStorage.setItem(
      "app:settings:v1",
      JSON.stringify({ macroTargets: { protein: 100, carbs: 200, fat: 60 } })
    );
    applyCoachGoal(UID, goal({ goal_type: "protein", target_value: 150, unit: "g" }));
    const settings = JSON.parse(localStorage.getItem("app:settings:v1")!);
    expect(settings.macroTargets).toEqual({ protein: 150, carbs: 200, fat: 60 });
  });

  it("sets stepsGoal on the tracker", () => {
    applyCoachGoal(UID, goal({ goal_type: "steps", target_value: 9000, unit: "צעדים" }));
    const raw = JSON.parse(localStorage.getItem(`user_${UID}:dailyTracker:v1`)!);
    expect(raw.stepsGoal).toBe(9000);
  });
});
