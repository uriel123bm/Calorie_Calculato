import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TraineeSyncBuckets } from "../../services/coachApi";
import { TraineeCalendar } from "./TraineeCalendar";
import { TraineeWeeklyReport } from "./TraineeWeeklyReport";

const sync: TraineeSyncBuckets = {
  tracker: JSON.stringify({
    date: "2026-10-15",
    targetCalories: 2000,
    entries: [{ name: "שקשוקה", calories: 200, protein: 12, carbohydrates: 8, fat: 10 }],
    stepsToday: 3500,
    stepsGoal: 10000,
  }),
  history: JSON.stringify([
    {
      date: "2026-10-14",
      targetCalories: 2000,
      entries: [{ name: "טונה", calories: 108, protein: 24, carbohydrates: 0, fat: 1 }],
      stepsToday: 8000,
    },
  ]),
  meals: null,
  body: null,
  personal_plan: null,
  updated_at: null,
};

describe("coach history views", () => {
  it("shows real meals from the history array instead of an empty week", () => {
    render(<TraineeWeeklyReport sync={sync} />);
    expect(screen.queryByText("אין נתוני היסטוריה")).not.toBeInTheDocument();
    expect(screen.getByText("108")).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
    expect(screen.getByText("2/7")).toBeInTheDocument();
  });

  it("lets the coach open yesterday from the calendar and see that meal", () => {
    render(<TraineeCalendar sync={sync} />);
    expect(screen.getByText("שקשוקה")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ד' 14/10/2026" }));
    expect(screen.getByText("טונה")).toBeInTheDocument();
    expect(screen.getByText(/8,000|8000/)).toBeInTheDocument();
  });
});
