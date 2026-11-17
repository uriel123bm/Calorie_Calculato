import { afterEach, describe, expect, it, vi } from "vitest";

const { del } = vi.hoisted(() => ({ del: vi.fn() }));
vi.mock("../services/api", () => ({ client: { delete: del } }));
vi.mock("../context/ToastContext", () => ({ useToast: () => ({ pushToast: vi.fn() }) }));

import { detachPushSubscription } from "./usePushNotifications";

function mockDeviceSubscription(endpoint: string) {
  const unsubscribe = vi.fn().mockResolvedValue(true);
  const reg = { pushManager: { getSubscription: vi.fn().mockResolvedValue({ endpoint, unsubscribe }) } };
  vi.stubGlobal("navigator", { serviceWorker: { getRegistration: vi.fn().mockResolvedValue(reg) } });
  return unsubscribe;
}

describe("detachPushSubscription", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    del.mockReset();
  });

  it("removes this device from the server and the browser on logout", async () => {
    del.mockResolvedValue({});
    const unsubscribe = mockDeviceSubscription("https://push.example/abc");

    await detachPushSubscription();

    expect(del).toHaveBeenCalledWith("/push/unsubscribe", { data: { endpoint: "https://push.example/abc" } });
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("still unsubscribes the browser and never throws when the server call fails", async () => {
    del.mockRejectedValue(new Error("offline"));
    const unsubscribe = mockDeviceSubscription("https://push.example/xyz");

    await expect(detachPushSubscription()).resolves.toBeUndefined();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
