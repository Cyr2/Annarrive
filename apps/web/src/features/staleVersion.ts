import { crumb, incident, version } from "../api/journal.ts";

/** Chrome, Safari, Firefox: a module file that did not come, or came as something else (the server's page). */
const MODULE_FAILED = /dynamically imported module|Importing a module script failed/i;
const TRIED_KEY = "stale-version-tried";

/** What a no-store fetch of the missing file says: still there (a blip), gone (or served as a page), or no network. */
export type Probe = "ok" | "missing" | "unreachable";
export type Recovery = "none" | "activate" | "reset";

/**
 * A shell whose files are gone (a version deployed since, a precache that kept a page in place of a module) heals
 * itself once: the waiting version takes over, or else the service worker and its caches go and the page reloads.
 * Offline, or already tried for this shell, nothing moves: « Réessayer » stays.
 */
export function recovery(state: {
  moduleFailed: boolean;
  online: boolean;
  tried: boolean;
  waiting: boolean;
  probe: Probe;
}): Recovery {
  if (!state.moduleFailed || !state.online || state.tried || state.probe === "unreachable") return "none";
  if (state.waiting) return "activate";
  return state.probe === "missing" ? "reset" : "none";
}

async function probe(url: string | undefined): Promise<Probe> {
  try {
    if (url) {
      const response = await fetch(url, { cache: "no-store" });
      return response.ok && /javascript/.test(response.headers.get("content-type") ?? "") ? "ok" : "missing";
    }
    // Safari names no file: the server's shell (a query the precache does not know) says whether this one is current.
    const shell = await fetch(`/?shell=${Date.now()}`, { cache: "no-store" });
    return (await shell.text()).includes(version()) ? "ok" : "missing";
  } catch {
    return "unreachable";
  }
}

/** Asks for a newer service worker and waits for it to finish installing. */
async function newerWaiting(registration: ServiceWorkerRegistration | undefined) {
  await registration?.update().catch(() => undefined);
  const installing = registration?.installing;
  if (installing)
    await new Promise<void>((resolve) =>
      installing.addEventListener("statechange", () => installing.state !== "installing" && resolve()),
    );
  return registration?.waiting ?? null;
}

function reload() {
  try {
    // Not a launch: no launch animation (index.html), as after « Recharger ».
    sessionStorage.setItem("splash-skip", "1");
  } catch {
    // Without storage, the animation plays once more.
  }
  location.reload();
}

/** One automatic attempt per shell: if the same shell comes back broken, « Réessayer » is the last word. */
function tryOnce() {
  try {
    if (sessionStorage.getItem(TRIED_KEY) === version()) return false;
    sessionStorage.setItem(TRIED_KEY, version());
    return true;
  } catch {
    // Without storage, nothing guards against a loop: no automatic reload.
    return false;
  }
}

const tried = () => {
  try {
    return sessionStorage.getItem(TRIED_KEY) === version();
  } catch {
    return true;
  }
};

/** Called for every error a boundary catches; only a module that did not load, online, does anything. */
export async function recoverStaleVersion(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (!MODULE_FAILED.test(message) || !navigator.onLine || tried()) return;
  // The pwa-register chunk may be gone too: the service worker is reached directly.
  const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  const waiting = await newerWaiting(registration);
  const action = recovery({
    moduleFailed: true,
    online: navigator.onLine,
    tried: tried(),
    waiting: waiting !== null,
    probe: await probe(/https?:\/\/\S+\.js/.exec(message)?.[0]),
  });
  if (action === "none" || !tryOnce()) return;
  crumb("app", `version périmée : ${action === "activate" ? "nouvelle version" : "remise à zéro"}`);
  incident(
    "chunk",
    `Version périmée (${version()}) : ${action === "activate" ? "nouvelle version activée" : "service worker et caches effacés"}`,
  );
  if (waiting && action === "activate") {
    navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
    // The message the generated service worker listens for (registerType "prompt").
    waiting.postMessage({ type: "SKIP_WAITING" });
    return;
  }
  try {
    const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(registrations.map((r) => r.unregister()));
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("workbox-")).map((name) => caches.delete(name)));
  } finally {
    reload();
  }
}
