import { useEffect, useRef } from "react";

const TAB_ROOT = "tabroot";

/**
 * The tab already on screen touched again, as on iOS: its screen goes back to where it starts. Each screen may
 * listen (Semaine comes back to this week, Reggie to the last message); true when none took over the scroll, so
 * the page goes back to its top.
 */
export function backToTabRoot(): boolean {
  return dispatchEvent(new Event(TAB_ROOT, { cancelable: true }));
}

/** What this screen does when its tab is touched again. `preventDefault()` keeps the page from scrolling to its top. */
export function useTabRoot(onRoot: (event: Event) => void) {
  const latest = useRef(onRoot);
  latest.current = onRoot;
  useEffect(() => {
    const listener = (event: Event) => latest.current(event);
    addEventListener(TAB_ROOT, listener);
    return () => removeEventListener(TAB_ROOT, listener);
  }, []);
}
