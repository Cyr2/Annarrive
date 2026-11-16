import type { Api } from "../../api/client.ts";

/**
 * `install`: an iPhone outside the home screen app, where iOS offers no push.
 * `hidden`: the server has no VAPID key. `denied`: refused once, only iOS Réglages can undo it.
 */
export type PushStatus = "unsupported" | "install" | "hidden" | "denied" | "off" | "on";

type Subscription = { endpoint: string; toJSON(): unknown; unsubscribe(): Promise<boolean> };
type Manager = {
  getSubscription(): Promise<Subscription | null>;
  subscribe(options: {
    userVisibleOnly: boolean;
    applicationServerKey: Uint8Array<ArrayBuffer>;
  }): Promise<Subscription>;
};

/** What the browser offers, passed in so the logic runs in tests without a service worker. */
export type PushEnv = {
  supported: boolean;
  ios: boolean;
  standalone: boolean;
  permission: () => NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
  manager: () => Promise<Manager>;
};

export function browserEnv(): PushEnv {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  // iPadOS reports itself as a Mac: the touch screen tells them apart.
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && navigator.standalone === true);
  return {
    supported,
    ios,
    standalone,
    permission: () => Notification.permission,
    requestPermission: () => Notification.requestPermission(),
    manager: async () => (await navigator.serviceWorker.ready).pushManager,
  };
}

/** The VAPID public key, base64url, as the bytes `subscribe` wants. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/**
 * At each app start: where push stands, and the key to subscribe with. A subscription the browser still holds
 * is sent again, since the server drops the ones a push service refused.
 */
export async function checkPush(api: Api, env: PushEnv): Promise<{ status: PushStatus; key: string | null }> {
  if (env.ios && !env.standalone) return { status: "install", key: null };
  if (!env.supported) return { status: "unsupported", key: null };
  const key = await api.pushKey();
  if (!key) return { status: "hidden", key };
  if (env.permission() === "denied") return { status: "denied", key };
  const subscription = env.permission() === "granted" ? await (await env.manager()).getSubscription() : null;
  if (!subscription) return { status: "off", key };
  await api.subscribePush(subscription.toJSON());
  return { status: "on", key };
}

/** `asked` is the permission prompt, started in the tap itself: iOS only shows it during a user gesture. */
export async function enablePush(
  api: Api,
  env: PushEnv,
  key: string,
  asked: Promise<NotificationPermission>,
): Promise<PushStatus> {
  if ((await asked) !== "granted") return "denied";
  const subscription = await (await env.manager()).subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(key),
  });
  await api.subscribePush(subscription.toJSON());
  return "on";
}

export async function disablePush(api: Api, env: PushEnv): Promise<PushStatus> {
  const subscription = await (await env.manager()).getSubscription();
  if (subscription) {
    await api.unsubscribePush(subscription.endpoint);
    await subscription.unsubscribe();
  }
  return "off";
}
