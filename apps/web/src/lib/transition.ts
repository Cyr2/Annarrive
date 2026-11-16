import { flushSync } from "react-dom";

/**
 * Runs a navigation inside a same-document view transition, so the old and new screens cross-fade
 * (200 ms, 150 ms under reduced motion, see motion.css). Plain update where the API is missing.
 */
export function withTransition(update: () => void) {
  if (!("startViewTransition" in document)) return update();
  document.startViewTransition(() => flushSync(update));
}
