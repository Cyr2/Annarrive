// Web Push for the generated service worker, which loads this file through `workbox.importScripts` (vite.config.ts).
// The server sends `{ title, body, url }` (apps/server/src/services/notifications.ts).

/** Only screens of this app open on tap: any other origin falls back to Aujourd'hui. */
function sameOrigin(url) {
  try {
    const target = new URL(typeof url === "string" ? url : "/", self.location.origin);
    return target.origin === self.location.origin ? target.href : self.location.origin;
  } catch {
    return self.location.origin;
  }
}

function readMessage(event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // A payload that is not JSON still shows, with the app name.
  }
  return {
    title: typeof data.title === "string" ? data.title : "Annarrivé",
    body: typeof data.body === "string" ? data.body : "",
    url: sameOrigin(data.url),
  };
}

self.addEventListener("push", (event) => {
  const message = readMessage(event);
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: "/icon-192.png",
      data: { url: message.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = sameOrigin(event.notification.data?.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (!open) return self.clients.openWindow(url);
      await open.focus();
      return open.navigate(url);
    })(),
  );
});
