import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DailyTracker } from "../DailyTracker";
import type { DailyTrackerState } from "../../types";

describe("DailyTracker", () => {
  it("renders daily tracker data and manual add section", () => {
    const state: DailyTrackerState = {
      date: "2026-04-28",
      targetCalories: 2200,
      entries: [],
    };

    render(
      <DailyTracker
        state={state}
        history={[]}
        streak={0}
        setTarget={() => {}}
        addEntry={() => {}}
        removeEntry={() => {}}
        resetDay={() => {}}
      />
    );

    expect(screen.getByText("קלוריות היומיות")).toBeInTheDocument();
    expect(screen.getByText("הוסף ערך ידני")).toBeInTheDocument();
    expect(screen.getByLabelText("יעד יומי (קלוריות):")).toBeInTheDocument();
    expect(screen.getByText("שם הפריט")).toBeInTheDocument();
    expect(screen.getByText("יחידת מידה")).toBeInTheDocument();
  });

  it("offers the four newest meals as one-tap repeats", () => {
    const entry = (id: string, name: string, addedAt: number) => ({
      id,
      name,
      calories: 100,
      protein: 1,
      carbohydrates: 2,
      fat: 3,
      addedAt,
    });
    render(
      <DailyTracker
        state={{
          date: "2026-04-28",
          targetCalories: 2200,
          entries: [entry("today", "ביצה", 5)],
        }}
        history={[
          {
            date: "2026-04-27",
            targetCalories: 2200,
            entries: [
              entry("a", "לחם", 4),
              entry("b", "טונה", 3),
              entry("c", "אורז", 2),
              entry("d", "יוגורט", 1),
            ],
          },
        ]}
        streak={0}
        setTarget={() => {}}
        addEntry={() => {}}
        removeEntry={() => {}}
        resetDay={() => {}}
      />
    );

    expect(screen.getByText("אכלתי שוב")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ביצה" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "לחם" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "טונה" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "אורז" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "יוגורט" })).not.toBeInTheDocument();
  });
});
