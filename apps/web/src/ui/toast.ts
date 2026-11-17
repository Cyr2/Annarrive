import { create } from "zustand";

/** How long the undo banner stays (docs/interactions.md, rule 1). */
export const TOAST_MS = 6000;

// Above the tab bar, and above Reggie's field when it is on screen (Composer.tsx sets --composer-height).
export const TOAST_BOTTOM =
  "calc(env(safe-area-inset-bottom) + var(--space-above-tabbar) + var(--composer-height, 0px))";

export type ToastAction = { label: string; onClick: () => void };

type HostState = {
  wanted: boolean;
  ready?: () => void;
  failed?: () => void;
  /** A banner drawn without Sonner, when its chunk could not load. */
  plain?: { message: string; action?: ToastAction };
};

/** Sonner is loaded with the first banner (or at idle), not with the first screen. */
export const useToastHost = create<HostState>(() => ({ wanted: false }));

let mounted: Promise<void> | undefined;

function mountToaster(): Promise<void> {
  mounted ??= new Promise((resolve, reject) =>
    useToastHost.setState({
      wanted: true,
      ready: resolve,
      failed: () => {
        // The next banner tries the network again.
        mounted = undefined;
        useToastHost.setState({ wanted: false });
        reject(new Error("toast"));
      },
    }),
  );
  return mounted;
}

/** Shows the bottom banner, with "Annuler" or another action when given. */
export async function notify(message: string, action?: ToastAction, duration = TOAST_MS) {
  try {
    const [{ toast }] = await Promise.all([import("sonner"), mountToaster()]);
    useToastHost.setState({ plain: undefined });
    toast(message, { duration, action });
  } catch {
    // Offline before Sonner was ever cached: the message still shows, most often "Pas de connexion".
    useToastHost.setState({ plain: { message, action } });
  }
}
