/** Set once onboarding is over, so the app never even loads its chunk again. Kept apart: the first screen reads it. */
export const DONE_KEY = "talaria.onboarding";

export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === "done";
  } catch {
    return false;
  }
}
