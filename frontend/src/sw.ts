/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope;

// Injected by vite-plugin-pwa (injectManifest mode).
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Skip waiting immediately on install so new deploys take effect without
// requiring the user to click an update prompt. The registerSwLifecycle.ts
// controllerchange listener will reload the page automatically.
self.addEventListener("install", () => {
  void self.skipWaiting();
});

// Claim all open clients immediately after activation so the controllerchange
// event fires in every open tab and triggers a page reload.
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Also respond to manual skip-waiting messages from PwaUpdatePrompt.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

// ── Push notification handler ─────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload: { title?: string; body?: string; tag?: string } = {};
  try {
    payload = event.data.json() as typeof payload;
  } catch {
    payload = { body: event.data.text() };
  }

  const title = payload.title ?? "מחשבון קלוריות";
  const body  = payload.body  ?? "";
  const tag   = payload.tag   ?? "calorie-reminder";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:   "/icon-192.png",
      badge:  "/icon-192.png",
      dir:    "rtl",
      lang:   "he",
      tag,
    })
  );
});

// ── Notification click — open / focus the app ─────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow("/");
      })
  );
});
