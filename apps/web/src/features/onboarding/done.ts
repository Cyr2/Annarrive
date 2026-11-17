/** Set once onboarding is over, so the app never even loads its chunk again. Kept apart: the first screen reads it. */
export const DONE_KEY = "annarrive.onboarding";

export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === "done";
  } catch {
    return false;
  }
}

/**
 * Whether to load the onboarding chunk at all: only when this phone has not seen it end and the server says it
 * is not done. A new phone of someone already set up costs one small request, not the whole flow.
 */
export async function needsOnboarding(): Promise<boolean> {
  if (isOnboarded()) return false;
  try {
    const { onboardingApi } = await import("../../api/onboarding.ts");
    const done = await (await onboardingApi()).done();
    if (done) localStorage.setItem(DONE_KEY, "done");
    return !done;
  } catch {
    // Unreachable server or private mode: ask again on the next launch rather than block the app.
    return false;
  }
}
