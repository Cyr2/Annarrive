import { useLocation } from "wouter";
import { onSheetEntry } from "./sheets/store.ts";

/** Navigates to another tab, as the tab bar does (the new screen fades in, see App.tsx). */
export function useGo() {
  const [, navigate] = useLocation();
  // From a sheet that is closing, the new screen takes the sheet's history entry: Back then leaves the screen.
  return (href: string) => navigate(href, { replace: onSheetEntry() });
}
