/** Réglages, pushed over Programme: the Programme tab stays the active one. */
export const SETTINGS_PATH = "/programme/reglages";
export const PUSHED = { from: "programme" } as const;

const pushed = () => {
  const state: unknown = history.state;
  return typeof state === "object" && state !== null && "from" in state && state.from === PUSHED.from;
};

/**
 * « ‹ Programme », a swipe to the right or the Programme tab touched again: Réglages pops back to Programme, as an
 * iOS stack does, so Back never lands on it again. Opened directly (a reload), there is nothing to pop: Programme
 * takes its place.
 */
export function leaveSettings(navigate: (to: string, options: { replace: boolean }) => void) {
  if (pushed()) history.back();
  else navigate("/programme", { replace: true });
}
