import { create } from "zustand";

/** Every sheet of the app. One on screen at a time, as on iOS; one opened from another stacks on it (Retour). */
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
  | { kind: "lastTime" }
  | { kind: "watch" }
  | { kind: "cycle" }
  | { kind: "timetable" }
  | { kind: "stop" };

export type SettingKey = "runsPerWeek" | "noRunDays" | "longRunDays" | "notBefore" | "notAfter" | "bedtime";

type SheetState = {
  current?: SheetSpec;
  /** The sheets the current one was opened from, oldest first: they stay mounted, with their state, for Retour. */
  below: SheetSpec[];
  open: boolean;
  /** A sheet asked for while another one is closing. */
  queued?: SheetSpec;
  /** The current sheet took the place of another without closing: it does not rise again. */
  chained: boolean;
  /** From the page, a sheet rises; from a sheet, it takes its place and Retour goes back to it. */
  show: (spec: SheetSpec) => void;
  /** The next step of a flow, in the sheet already up: no slide down and up again. */
  replace: (spec: SheetSpec) => void;
  /** Retour: the sheet under the current one comes back as she left it. */
  back: () => void;
  /** Closes the whole stack. `fromBack`: the system's Back already left the sheet's history entry. */
  close: (fromBack?: boolean) => void;
  /** Called by `close` when the closing animation ends. */
  closed: () => void;
};

/** A sheet's closing slide (EXIT_SHEET in lib/motion.ts) and a margin: the content unmounts once it is out of sight. */
export const SHEET_CLOSE_MS = 320;

// Android's Back and the browser's step back through the sheets, as in a native app: each has its own history entry.
const depthOf = (state: unknown): number => {
  if (typeof state !== "object" || state === null || !("sheet" in state) || state.sheet !== true) return 0;
  return "depth" in state && typeof state.depth === "number" ? state.depth : 1;
};
const hasHistory = () => typeof history !== "undefined";
export const onSheetEntry = () => hasHistory() && depthOf(history.state) > 0;
const pushEntry = (depth: number) => {
  if (hasHistory() && depthOf(history.state) < depth) history.pushState({ sheet: true, depth }, "");
};

export const useSheet = create<SheetState>((set, get) => ({
  below: [],
  open: false,
  chained: false,
  show(spec) {
    const { current, open, below } = get();
    if (!current) {
      pushEntry(1);
      return set({ current: spec, below: [], open: true, chained: false });
    }
    if (!open) return set({ queued: spec });
    pushEntry(below.length + 2);
    set({ current: spec, below: [...below, current], chained: true });
  },
  replace(spec) {
    if (!get().open) return get().show(spec);
    set({ current: spec, chained: true });
  },
  back() {
    const { below, open } = get();
    const previous = below.at(-1);
    if (!open || !previous) return get().close();
    set({ current: previous, below: below.slice(0, -1) });
    // Its entry goes too; the popstate that follows finds the stack already at that depth.
    if (onSheetEntry()) history.back();
  },
  // The sheets stay mounted until the slide is over, then a queued sheet rises.
  close(fromBack = false) {
    if (!get().open) return;
    set({ open: false });
    // After the current task: a navigation right after the close (useGo) takes the entry over instead.
    if (!fromBack)
      queueMicrotask(() => {
        const depth = hasHistory() ? depthOf(history.state) : 0;
        if (depth > 0) history.go(-depth);
      });
    setTimeout(() => get().closed(), SHEET_CLOSE_MS);
  },
  closed() {
    const next = get().queued;
    if (next) pushEntry(1);
    set({ current: next, below: [], open: Boolean(next), queued: undefined, chained: false });
  },
}));

/** The system's Back: one sheet down the stack, or the whole stack closes once Back leaves its first entry. */
export function onHistoryBack(state: unknown) {
  const sheets = useSheet.getState();
  const depth = depthOf(state);
  if (depth === 0) return sheets.close(true);
  const previous = sheets.below[depth - 1];
  if (sheets.open && previous) useSheet.setState({ current: previous, below: sheets.below.slice(0, depth - 1) });
}

if (typeof window !== "undefined") addEventListener("popstate", (event) => onHistoryBack(event.state));
