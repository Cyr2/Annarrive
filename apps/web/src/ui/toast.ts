import { create } from "zustand";

/** How long the undo banner stays (docs/interactions.md, rule 1). */
export const TOAST_MS = 6000;

type ToastAction = { label: string; onClick: () => void };

type HostState = { wanted: boolean; ready?: () => void };

/** Sonner is loaded with the first banner, not with the first screen. */
export const useToastHost = create<HostState>(() => ({ wanted: false }));

let mounted: Promise<void> | undefined;

function mountToaster(): Promise<void> {
  mounted ??= new Promise((resolve) => useToastHost.setState({ wanted: true, ready: resolve }));
  return mounted;
}

/** Shows the bottom banner, with "Annuler" or another action when given. */
export async function notify(message: string, action?: ToastAction) {
  const [{ toast }] = await Promise.all([import("sonner"), mountToaster()]);
  toast(message, { duration: TOAST_MS, action });
}
