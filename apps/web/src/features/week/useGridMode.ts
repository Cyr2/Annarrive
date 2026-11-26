import { useEffect, useState, useSyncExternalStore } from "react";

/** The history entry the grid pushed when the button opened it. */
const onGridEntry = (): boolean => {
  const state: unknown = history.state;
  return typeof state === "object" && state !== null && "grid" in state;
};

/** A phone on its side: a tall desktop window is landscape too, and keeps the list. */
const LANDSCAPE = "(orientation: landscape) and (max-height: 540px)";

function useLandscape(): boolean {
  return useSyncExternalStore(
    (changed) => {
      const query = matchMedia(LANDSCAPE);
      query.addEventListener("change", changed);
      return () => query.removeEventListener("change", changed);
    },
    () => matchMedia(LANDSCAPE).matches,
  );
}

/**
 * Semaine's calendar view (semaine-v2, B): turning the phone shows it, turning back leaves it. The button opens it
 * upright too, then only the button or the system's Back (an entry of its own in the history) closes it. The button
 * on a phone on its side brings the list back until she turns it upright.
 */
export function useGridMode() {
  const landscape = useLandscape();
  const [asked, setAsked] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!landscape) setDismissed(false);
  }, [landscape]);

  useEffect(() => {
    if (!asked) return;
    history.pushState({ grid: true }, "");
    const onPop = () => {
      // A sheet opened from the grid has its own entry above this one: closing it lands back here.
      if (!onGridEntry()) setAsked(false);
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, [asked]);

  const shown = asked || (landscape && !dismissed);
  const toggle = () => {
    if (!shown) {
      setAsked(true);
      setDismissed(false);
      return;
    }
    if (asked && onGridEntry()) history.back();
    setAsked(false);
    setDismissed(landscape);
  };
  return { shown, landscape, toggle };
}
