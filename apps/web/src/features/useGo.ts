import { useLocation } from "wouter";
import { withTransition } from "../lib/transition.ts";

/** Navigates to another tab with the same cross-fade as the tab bar. */
export function useGo() {
  const [, navigate] = useLocation();
  return (href: string) => withTransition(() => navigate(href));
}
