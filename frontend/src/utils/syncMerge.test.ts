import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DailyEntry } from "../types";
import {
  extractHistoricalDayLogFromTracker,
  mergeDailyTrackerBlobs,
  mergeHistoryBlobs,
} from "./syncMerge";

const TODAY = "2026-11-17";
const entry = (id: string, calories = 100): DailyEntry => ({
  id, name: id, calories, protein: 1, carbohydrates: 1, fat: 1, addedAt: 1,
});

describe("sync merge keeps deletions", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 17, 12, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("does not resurrect an entry deleted locally before the push reached the server", () => {
    const local = { date: TODAY, targetCalories: 2000, entries: [entry("keep")], deletedIds: ["gone"] };
    const remote = { date: TODAY, targetCalories: 2000, entries: [entry("keep"), entry("gone")] };

    const merged = mergeDailyTrackerBlobs(local, remote);

    expect(merged.entries.map((e) => e.id)).toEqual(["keep"]);
    expect(merged.deletedIds).toEqual(["gone"]);
  });

  it("applies a deletion made on another device", () => {
    const local = { date: TODAY, targetCalories: 2000, entries: [entry("keep"), entry("gone")] };
    const remote = { date: TODAY, targetCalories: 2000, entries: [entry("keep")], deletedIds: ["gone"] };

    expect(mergeDailyTrackerBlobs(local, remote).entries.map((e) => e.id)).toEqual(["keep"]);
  });

  it("does not resurrect an entry deleted from a past day", () => {
    const local = [{ date: "2026-11-15", targetCalories: 2000, entries: [], deletedIds: ["old"] }];
    const remote = [{ date: "2026-11-15", targetCalories: 2000, entries: [entry("old")] }];

    const merged = mergeHistoryBlobs(local, remote);

    expect(merged[0].entries).toEqual([]);
    expect(merged[0].deletedIds).toEqual(["old"]);
  });

  it("carries deletions when yesterday's tracker is archived into history", () => {
    const yesterday = {
      date: "2026-11-16", targetCalories: 2000,
      entries: [entry("a"), entry("b")], deletedIds: ["b"],
    };
    const log = extractHistoricalDayLogFromTracker(yesterday);
    expect(log?.entries.map((e) => e.id)).toEqual(["a"]);
    expect(log?.deletedIds).toEqual(["b"]);
  });

  it("drops a previous day's deletion markers when the tracker rolls to today", () => {
    const stale = { date: "2026-11-16", targetCalories: 2000, entries: [], deletedIds: ["x"] };
    expect(mergeDailyTrackerBlobs(stale, null).deletedIds).toBeUndefined();
  });
});
