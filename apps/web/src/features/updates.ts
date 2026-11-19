import type { registerSW } from "virtual:pwa-register";
import { crumb } from "../api/journal.ts";
import { notify } from "../ui/toast.ts";
import { usePlan } from "./plan/store.ts";
import { useSheet } from "./sheets/store.ts";

/** Runs `task` once nothing is in progress: no sheet up, no change on its way. */
function whenCalm(task: () => void) {
  const calm = () => !useSheet.getState().current && !usePlan.getState().busy;
  if (calm()) return task();
  const stopSheet = useSheet.subscribe(check);
  const stopPlan = usePlan.subscribe(check);
  function check() {
    if (!calm()) return;
    stopSheet();
    stopPlan();
    task();
  }
}

/**
 * A new version waits until she says so (vite.config.ts, registerType "prompt"): offered in a banner at a calm
 * moment, never in the middle of an action. A PWA kept in memory for days looks for one each time it comes back.
 */
export function watchForUpdates(register: typeof registerSW) {
  const offer = () =>
    whenCalm(
      () =>
        void notify(
          "Nouvelle version prête",
          { label: "Recharger", onClick: () => void update(true) },
          Infinity,
          "update",
        ),
    );
  const update = register({
    onNeedRefresh: () => {
      crumb("app", "nouvelle version prête");
      offer();
    },
    onRegisteredSW(_url, registration) {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") return;
        // A banner swiped away comes back the next time she opens the app, while the version still waits.
        if (registration?.waiting) offer();
        void registration?.update().catch(() => undefined);
      });
    },
  });
}
