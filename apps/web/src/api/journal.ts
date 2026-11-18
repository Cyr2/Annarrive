import { type Breadcrumb, type IncidentInput, redact } from "@annarrive/protocol";

/**
 * The incident journal (architecture.md, « Journal des incidents »): her last 50 gestures, and what broke after
 * them, sent to the server so Darius can fix it without asking her. It never reads what she types (fields,
 * Reggie, notes), only the names of what she taps; it never sends a cookie or a token.
 */

const MAX_CRUMBS = 50;
/** An action that waits longer than this is an incident of its own. */
export const SLOW_MS = 3000;
const QUEUE_KEY = "annarrive-incidents";
const MAX_QUEUE = 20;
/** Per page load: a loop that throws at every frame sends a few, not thousands. */
const MAX_PER_LOAD = 20;
const BATCH = 3;

export type IncidentType = IncidentInput["type"];

const crumbs: Breadcrumb[] = [];
const seen = new Set<string>();
let queue: IncidentInput[] = [];
let recorded = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let sending = false;

export function crumb(kind: Breadcrumb["kind"], label: string) {
  crumbs.push({ at: new Date().toISOString(), kind, label: redact(label).slice(0, 200) });
  if (crumbs.length > MAX_CRUMBS) crumbs.shift();
}

export const breadcrumbs = (): readonly Breadcrumb[] => crumbs;

/** The built entry file (`index-<hash>.js`): it names the build its stacks map back to. */
const version = () =>
  document.querySelector<HTMLScriptElement>("script[type=module][src]")?.src.split("/").pop() ?? "dev";

function device(): IncidentInput["device"] {
  const ua = navigator.userAgent;
  return {
    userAgent: ua.slice(0, 400),
    viewport: `${innerWidth}x${innerHeight}`,
    standalone:
      matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && navigator.standalone === true),
    os: /iPhone|iPad|iPod/.test(ua) ? "ios" : /Android/.test(ua) ? "android" : "other",
    version: version().slice(0, 100),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone.slice(0, 60),
    online: navigator.onLine,
  };
}

/** Records an incident with the gestures that led to it; a « report » is always sent, the rest once per message. */
export function incident(type: IncidentType, message: string, stack?: string) {
  if (type !== "report") {
    if (seen.has(type + message) || recorded >= MAX_PER_LOAD) return;
    seen.add(type + message);
    recorded += 1;
  }
  load();
  queue.push({
    type,
    message: redact(message).slice(0, 1000),
    stack: stack === undefined ? undefined : redact(stack).slice(0, 8000),
    at: new Date().toISOString(),
    route: location.pathname.slice(0, 200),
    breadcrumbs: [...crumbs],
    device: device(),
  });
  queue = queue.slice(-MAX_QUEUE);
  save();
  clearTimeout(timer);
  // A burst (an error and the failed call behind it) leaves as one request.
  timer = setTimeout(() => void flush(), 1000);
}

/** The queue survives a reload or a closed app: offline, it waits for the network. */
function load() {
  if (queue.length > 0) return;
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
    // Its own earlier writes, checked again by the server's schema on arrival.
    if (Array.isArray(stored)) queue = stored.slice(-MAX_QUEUE);
  } catch {
    // Private mode or a broken entry: start over.
  }
}

function save() {
  try {
    if (queue.length > 0) localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    else localStorage.removeItem(QUEUE_KEY);
  } catch {
    // Storage full or blocked: the incidents still leave from memory.
  }
}

/**
 * Sends the queue in batches, outside the app's API client (its calls are journaled themselves). `keepalive`
 * lets a batch leave while the app is closing. A refused batch is dropped; a network error or a 5xx waits.
 */
export async function flush(fetcher: typeof fetch = fetch) {
  load();
  if (sending || queue.length === 0 || !navigator.onLine) return;
  sending = true;
  try {
    while (queue.length > 0) {
      const batch = queue.slice(0, BATCH);
      const response = await fetcher("/api/incidents", {
        method: "POST",
        keepalive: true,
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ incidents: batch }),
      });
      // Signed out or held back: kept for later. Anything else the server read and refused would fail again.
      if (response.status >= 500 || response.status === 401 || response.status === 429) break;
      queue = queue.slice(batch.length);
      save();
    }
  } catch {
    // Offline after all: the next `online` sends it.
  } finally {
    sending = false;
  }
}

const isChunk = (message: string) =>
  /dynamically imported module|Importing a module script failed|Unable to preload|Failed to fetch/i.test(message);

/** A React boundary caught it, or nothing did. */
export function renderError(error: unknown, componentStack?: string) {
  const err = error instanceof Error ? error : new Error(String(error));
  incident(
    isChunk(err.message) ? "chunk" : "render",
    err.message,
    `${err.stack ?? ""}\n${componentStack ?? ""}`.trim(),
  );
}

/** One API call: a breadcrumb, and an incident when it failed on the server's side or took too long. */
export function apiCall(method: string, path: string, status: number, ms: number) {
  const where = `${method} ${path.split("?")[0]}`;
  crumb("api", `${where} ${status || "sans réponse"} · ${Math.round(ms)} ms`);
  if (status >= 500) incident("api", `${where} : ${status}`);
  else if (status === 0 && navigator.onLine) incident("api", `${where} : pas de réponse`);
  if (ms > SLOW_MS) incident("slow", `${where} a mis plus de ${SLOW_MS / 1000} s`);
}

/** What she taps, by its accessible name: a button's text is the app's own words, never what she typed. */
function tapName(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) return undefined;
  const el = target.closest(
    "button, a, [role=button], [role=tab], [role=switch], [role=radio], [role=option], select, [data-crumb]",
  );
  if (!el) return undefined;
  const name =
    el.getAttribute("data-crumb") ?? el.getAttribute("aria-label") ?? el.textContent?.trim().replace(/\s+/g, " ");
  return (name || el.tagName.toLowerCase()).slice(0, 60);
}

/** Listens for errors and the app's life from the first line of `main.tsx`, before anything can break. */
export function installJournal() {
  addEventListener("error", (e) => {
    // "Script error." from another origin carries nothing to fix.
    if (e.error || e.message !== "Script error.")
      incident("error", e.message, e.error instanceof Error ? e.error.stack : undefined);
  });
  addEventListener("unhandledrejection", (e) => {
    const reason: unknown = e.reason;
    if (reason instanceof Error)
      incident(isChunk(reason.message) ? "chunk" : "rejection", reason.message, reason.stack);
    else incident("rejection", String(reason));
  });
  // Vite's own event when a file a screen needs did not load.
  addEventListener("vite:preloadError", (e) =>
    incident("chunk", "payload" in e && e.payload instanceof Error ? e.payload.message : "Fichier introuvable"),
  );
  addEventListener(
    "click",
    (e) => {
      const name = tapName(e.target);
      if (name) crumb("tap", name);
    },
    { capture: true, passive: true },
  );
  document.addEventListener("visibilitychange", () => {
    crumb("app", document.visibilityState === "visible" ? "visible" : "cachée");
    void flush();
  });
  addEventListener("online", () => {
    crumb("app", "en ligne");
    void flush();
  });
  addEventListener("offline", () => crumb("app", "hors ligne"));
  void flush();
}

/** Test hook: back to a fresh page load. */
export function resetJournal() {
  crumbs.length = 0;
  seen.clear();
  queue = [];
  recorded = 0;
  clearTimeout(timer);
}
