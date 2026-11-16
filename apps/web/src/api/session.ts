import { create } from "zustand";

/** Set when the server answers 401: the app then only asks to open the login link (the link flow is server side). */
export const useSignedOut = create<{ signedOut: boolean }>(() => ({ signedOut: false }));

export const signOut = () => useSignedOut.setState({ signedOut: true });
