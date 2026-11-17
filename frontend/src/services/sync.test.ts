import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { get, put } = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
}));

vi.mock("./api", () => ({ client: { get, put } }));

import { endSyncSession, pullSync, schedulePush, setSyncUserId } from "./sync";

const EMPTY_REMOTE = {
  tracker: null, history: null, recipes: null, meals: null, settings: null,
  products: null, body: null, workouts: null, water: null,
  vitamins_config: null, vitamins_log: null, personal_plan: null, updated_at: null,
};

async function hydrate(uid: string) {
  setSyncUserId(uid);
  await pullSync(uid);
  await vi.advanceTimersByTimeAsync(2000);
  put.mockClear();
}

describe("sync session isolation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    get.mockReset().mockResolvedValue({ data: EMPTY_REMOTE });
    put.mockReset().mockResolvedValue({ data: {} });
  });
  afterEach(async () => {
    await endSyncSession();
    vi.useRealTimers();
  });

  it("never pushes a previous user's buckets after another user becomes active", async () => {
    localStorage.setItem("user_A:meals:v1", JSON.stringify([{ id: "m1", name: "A secret meal" }]));
    await hydrate("A");

    schedulePush("A");
    setSyncUserId("B");
    await vi.advanceTimersByTimeAsync(2000);

    expect(put).not.toHaveBeenCalled();
  });

  it("flushes the pending push on logout and stops pushing afterwards", async () => {
    localStorage.setItem("user_A:meals:v1", JSON.stringify([{ id: "m1", name: "lunch" }]));
    await hydrate("A");

    schedulePush("A");
    await endSyncSession();
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][1].meals).toEqual([{ id: "m1", name: "lunch" }]);

    put.mockClear();
    schedulePush("A");
    await vi.advanceTimersByTimeAsync(2000);
    expect(put).not.toHaveBeenCalled();
  });
});
