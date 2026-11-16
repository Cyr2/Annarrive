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
  show: (spec: SheetSpec) => void;
  close: () => void;
  /** Called by `close` when the closing animation ends. */
  closed: () => void;
};

/** Vaul's closing slide (its TRANSITIONS.DURATION). */
export const SHEET_CLOSE_MS = 500;

export const useSheet = create<SheetState>((set, get) => ({
  open: false,
  show(spec) {
    if (!get().current) return set({ current: spec, open: true });
    set({ queued: spec });
    get().close();
  },
  // Vaul reports the end of its closing slide only when it closed itself, never when `open` turns false.
  close() {
    if (!get().open) return;
    set({ open: false });
    setTimeout(() => get().closed(), SHEET_CLOSE_MS);
  },
  closed() {
    const next = get().queued;
    set({ current: next, open: Boolean(next), queued: undefined });
  },
}));
