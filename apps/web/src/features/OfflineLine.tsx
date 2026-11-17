import { useSyncExternalStore } from "react";
import { ago } from "../lib/date.ts";
import { usePlan } from "./plan/store.ts";

function subscribe(notify: () => void) {
  addEventListener("online", notify);
  addEventListener("offline", notify);
  return () => {
    removeEventListener("online", notify);
    removeEventListener("offline", notify);
  };
}

export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine);

/** Offline, the plan on screen is a copy: one quiet line says so, and from when. */
export function OfflineLine() {
  const online = useOnline();
  const loadedAt = usePlan((s) => s.loadedAt);
  if (online) return null;
  const when = loadedAt ? ` · plan lu ${ago(new Date(loadedAt).toISOString(), new Date())}` : "";
  return (
    <p
      role="status"
      className="t-cap m-0 mx-auto max-w-xl px-gutter text-center"
      style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
    >
      Hors ligne{when}
    </p>
  );
}
