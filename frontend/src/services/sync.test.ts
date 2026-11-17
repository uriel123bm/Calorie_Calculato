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

  it("pushes when the only local data is water or vitamins", async () => {
    await hydrate("A");
    // Clear every non-water bucket so the empty-gate cannot pass via leftovers.
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("user_A:") && !k.includes(":water:")) localStorage.removeItem(k);
    }
    localStorage.setItem("user_A:water:v1", JSON.stringify({ date: "2026-11-17", glasses: 3 }));
    put.mockClear();

    schedulePush("A");
    await vi.advanceTimersByTimeAsync(2000);

    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][1].water).toEqual({ date: "2026-11-17", glasses: 3 });
  });

  it("pushes the merged local state after a successful pull (hydration must be restored first)", async () => {
    await hydrate("A");
    localStorage.setItem("user_A:meals:v1", JSON.stringify([{ id: "m1", name: "only-local" }]));
    get.mockResolvedValueOnce({
      data: { ...EMPTY_REMOTE, meals: [{ id: "m2", name: "only-remote" }] },
    });
    put.mockClear();

    await pullSync("A");
    await vi.advanceTimersByTimeAsync(2000);

    expect(put).toHaveBeenCalled();
    const meals = put.mock.calls[0][1].meals;
    expect(meals.map((m: { id: string }) => m.id).sort()).toEqual(["m1", "m2"]);
  });

  it("does not drop a push that was armed before a pull — it runs after the pull finishes", async () => {
    await hydrate("A");
    localStorage.setItem("user_A:meals:v1", JSON.stringify([{ id: "m1", name: "offline meal" }]));
    put.mockClear();

    let releaseGet!: (v: unknown) => void;
    get.mockReturnValueOnce(new Promise((resolve) => { releaseGet = resolve; }));

    schedulePush("A"); // arms debounce while online edits are pending
    const pullPromise = pullSync("A"); // in-flight pull must block the timer
    await vi.advanceTimersByTimeAsync(2000);
    expect(put).not.toHaveBeenCalled();

    releaseGet({ data: EMPTY_REMOTE });
    await pullPromise;
    await vi.advanceTimersByTimeAsync(2000);

    expect(put).toHaveBeenCalled();
    expect(put.mock.calls[0][1].meals).toEqual([{ id: "m1", name: "offline meal" }]);
  });

  it("flushes a pending local push when the device comes back online even if pull fails", async () => {
    await hydrate("A");
    localStorage.setItem("user_A:meals:v1", JSON.stringify([{ id: "m1", name: "offline meal" }]));
    put.mockClear();
    get.mockRejectedValueOnce(new Error("still flaky"));

    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(2000);

    expect(put).toHaveBeenCalled();
    expect(put.mock.calls.some((c) => c[1]?.meals?.[0]?.name === "offline meal")).toBe(true);
  });
});
