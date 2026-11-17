import { create } from "zustand";

/** Every sheet of the app. One at a time, as on iOS; opening another replaces it once the first has closed. */
export type SheetSpec =
  | { kind: "move"; id: string }
  | { kind: "change"; id: string }
  | { kind: "unavailable"; id: string }
  | { kind: "session"; id: string }
  | { kind: "event"; id: string }
  | { kind: "add"; date?: string }
  | { kind: "strength"; templateId?: string }
  | { kind: "setting"; key: SettingKey }
  | { kind: "goal" }
  | { kind: "watch" }
  | { kind: "cycle" }
  | { kind: "stop" };

export type SettingKey = "runsPerWeek" | "noRunDays" | "notBefore" | "notAfter" | "bedtime";

type SheetState = {
  current?: SheetSpec;
  open: boolean;
  /** A sheet asked for while another one is still on screen. */
  queued?: SheetSpec;
  /** The sheet took the place of another without closing (Pas dispo, then Déplacer): it does not rise again. */
  chained: boolean;
  show: (spec: SheetSpec) => void;
  /** The next step of a flow, in the sheet already up: no slide down and up again. */
  replace: (spec: SheetSpec) => void;
  /** `fromBack`: the system's Back already left the sheet's history entry. */
  close: (fromBack?: boolean) => void;
  /** Called by `close` when the closing animation ends. */
  closed: () => void;
};

/** A sheet's closing slide (EXIT_SHEET in lib/motion.ts) and a margin: the content unmounts once it is out of sight. */
export const SHEET_CLOSE_MS = 320;

// Android's Back and the browser's close the sheet, as in a native app: an open sheet has its own history entry.
const ENTRY = { sheet: true };
export const onSheetEntry = () => typeof history !== "undefined" && history.state?.sheet === true;
const pushEntry = () => {
  if (typeof history !== "undefined" && !onSheetEntry()) history.pushState(ENTRY, "");
};

export const useSheet = create<SheetState>((set, get) => ({
  open: false,
  chained: false,
  show(spec) {
    if (!get().current) {
      pushEntry();
      return set({ current: spec, open: true, chained: false });
    }
    set({ queued: spec });
    get().close();
  },
  replace(spec) {
    if (!get().open) return get().show(spec);
    set({ current: spec, chained: true });
  },
  // The sheet's content stays mounted until its slide is over, then a queued sheet rises.
  close(fromBack = false) {
    if (!get().open) return;
    set({ open: false });
    // After the current task: a navigation right after the close (useGo) takes the entry over instead.
    if (!fromBack) queueMicrotask(() => onSheetEntry() && history.back());
    setTimeout(() => get().closed(), SHEET_CLOSE_MS);
  },
  closed() {
    const next = get().queued;
    if (next) pushEntry();
    set({ current: next, open: Boolean(next), queued: undefined, chained: false });
  },
}));

if (typeof window !== "undefined") addEventListener("popstate", () => useSheet.getState().close(true));
