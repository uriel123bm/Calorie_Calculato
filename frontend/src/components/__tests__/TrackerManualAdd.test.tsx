import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TrackerManualAdd } from "../TrackerManualAdd";
import type { DailyEntry, UserProduct } from "../../types";

const water: DailyEntry = {
  id: "w",
  name: "מים",
  calories: 0,
  protein: 0,
  carbohydrates: 0,
  fat: 0,
  addedAt: 1,
  mealType: "snack",
};

const cola: UserProduct = {
  id: "c",
  name: "קולה זירו",
  servingValue: 1,
  servingUnit: "יחידה",
  calories: 0,
  protein: 0,
  carbohydrates: 0,
  fat: 0,
  addedAt: 2,
};

describe("TrackerManualAdd", () => {
  it("lets a typed zero-calorie drink be saved", () => {
    const onAdd = vi.fn();
    render(<TrackerManualAdd onAdd={onAdd} />);

    fireEvent.change(screen.getByLabelText("שם הפריט"), { target: { value: "מים" } });
    fireEvent.change(screen.getByLabelText("קלוריות"), { target: { value: "0" } });
    const button = screen.getByRole("button", { name: "הוסף ליום" });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: "מים", calories: 0 }));
  });

  it("stays disabled when calories were not filled", () => {
    render(<TrackerManualAdd onAdd={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("שם הפריט"), { target: { value: "מים" } });
    expect(screen.getByRole("button", { name: "הוסף ליום" })).toBeDisabled();
  });

  it("repeats a journal meal in one tap", () => {
    const onAdd = vi.fn();
    render(<TrackerManualAdd onAdd={onAdd} repeatMeals={[water]} />);
    fireEvent.click(screen.getByRole("button", { name: "מים" }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: "מים", calories: 0, mealType: "snack" }));
  });

  it("adds a personal product immediately, including zero calories", () => {
    const onAdd = vi.fn();
    render(<TrackerManualAdd onAdd={onAdd} personalProducts={[cola]} />);
    fireEvent.click(screen.getByRole("button", { name: "קולה זירו" }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: "קולה זירו", calories: 0 }));
  });
});
