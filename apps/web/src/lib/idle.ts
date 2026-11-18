/** After the first screen's render has settled. Safari has no requestIdleCallback: a timeout stands in. */
export function whenIdle(task: () => void) {
  if (typeof requestIdleCallback === "function") requestIdleCallback(task, { timeout: 2000 });
  else setTimeout(task, 500);
}

/** Ends the current task, so the browser can paint and answer a tap before the work that follows. */
export const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve));
