import { create } from "zustand";

/** Set when the server answers 401: the app then only asks to open the login link (the link flow is server side). */
export const useSignedOut = create<{ signedOut: boolean }>(() => ({ signedOut: false }));

/** Her day, her week and her incident queue stay on the phone only while she is signed in. */
export function forgetPersonalData(): void {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith("annarrive")) localStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing was kept.
  }
}

export const signOut = () => {
  forgetPersonalData();
  useSignedOut.setState({ signedOut: true });
};
