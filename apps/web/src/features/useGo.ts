import { useLocation } from "wouter";

/** Navigates to another tab, as the tab bar does (the new screen fades in, see App.tsx). */
export function useGo() {
  const [, navigate] = useLocation();
  return (href: string) => navigate(href);
}
