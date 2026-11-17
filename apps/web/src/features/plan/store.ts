import { create } from "zustand";
import { readFirstScreen, saveFirstScreen } from "../../api/cache.ts";
import type { Api } from "../../api/client.ts";
import { errorMessage, OFFLINE } from "../../api/errors.ts";
import { api as defaultApi } from "../../api/index.ts";
import type { ChangeResult, Program, Today, Week } from "../../api/schemas.ts";
import { toIso } from "../../lib/date.ts";
import { notify as defaultNotify } from "../../ui/toast.ts";

/** `quiet`: no banner. `action`: replaces Annuler (settings show "Voir", docs/interactions.md). */
type ApplyOptions = { quiet?: boolean; action?: { label: string; onClick: () => void } };

type Notify = (message: string, action?: { label: string; onClick: () => void }) => void;

export type LoadStatus = "loading" | "ready" | "error";

/** A plan read longer ago than this is read again when the app comes back to the screen (another tab, a pause). */
export const STALE_MS = 60_000;

export type PlanState = {
  status: LoadStatus;
  /** Per week offset: absent until that week is asked for. */
  weekStatus: Record<number, LoadStatus>;
  programStatus?: LoadStatus;
  /** When the plan on screen was last read from the server (ms since epoch). */
  loadedAt?: number;
  /** A change is on its way to the server: its buttons wait, and a second tap sends nothing. */
  busy: boolean;
  today?: Today;
  weeks: Record<number, Week>;
  program?: Program;
  /** The latest change: the only one a Reggie change card can still undo. */
  lastChangeId?: string;
  load: () => Promise<void>;
  loadWeek: (offset: number) => Promise<void>;
  loadProgram: () => Promise<void>;
  /** Quietly re-reads everything already on screen: back to the foreground, a new day. */
  refresh: () => Promise<void>;
  /** Runs a change and shows the 6 s banner with Annuler as soon as the server answers; the screen follows. */
  apply: (action: (api: Api) => Promise<ChangeResult>, options?: ApplyOptions) => Promise<ChangeResult | undefined>;
  undo: (changeId: string) => Promise<void>;
  /** An action that is not a plan change (watch, feeling, timetable): run it, then re-read. */
  run: (action: (api: Api) => Promise<unknown>) => Promise<boolean>;
  /** Re-reads what is on screen after a change made elsewhere (Reggie), remembering it for Annuler. */
  sync: (changeId?: string) => Promise<void>;
};

/** True when what is on screen may no longer be true: another day, or read too long ago. */
export function isStale(state: Pick<PlanState, "today" | "loadedAt">, now: Date): boolean {
  if (!state.today || state.loadedAt === undefined) return true;
  return state.today.date !== toIso(now) || now.getTime() - state.loadedAt > STALE_MS;
}

export function createPlanStore(getApi: () => Promise<Api>, notify: Notify) {
  return create<PlanState>((set, get) => {
    // Several reads can overlap (a change, its undo, a return to the app): only the latest one is shown.
    let reads = 0;
    const read = async () => {
      const mine = ++reads;
      const client = await getApi();
      const offsets = Object.keys(get().weeks).map(Number);
      const [today, weeks, program] = await Promise.all([
        client.today(),
        Promise.all(offsets.map((o) => client.week(o))),
        get().program ? client.program() : Promise.resolve(undefined),
      ]);
      if (mine !== reads) return;
      const byOffset: Record<number, Week> = {};
      offsets.forEach((offset, i) => {
        const week = weeks[i];
        if (week) byOffset[offset] = week;
      });
      set({ today, weeks: byOffset, program, loadedAt: Date.now() });
      if (byOffset[0]) saveFirstScreen({ today, week: byOffset[0] });
    };
    // A read after a change that already landed: if it fails, the next return to the app reads again.
    const readLater = () => void read().catch(() => undefined);
    /** One action at a time; false when another one is still on its way. */
    const guarded = async <T>(action: () => Promise<T>): Promise<T | undefined> => {
      if (get().busy) return undefined;
      // Offline, a change cannot land: said at once rather than after a request that fails.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        notify(OFFLINE);
        return undefined;
      }
      set({ busy: true });
      try {
        return await action();
      } finally {
        set({ busy: false });
      }
    };
    /** The copy from the last launch, painted at once; the server's answer replaces it a moment later. */
    const paintSaved = () => {
      const saved = get().status === "loading" ? readFirstScreen(toIso(new Date())) : undefined;
      if (saved) set((s) => ({ status: "ready", today: saved.today, weeks: { ...s.weeks, 0: saved.week } }));
      // Réessayer shows the wait again instead of the same error.
      else if (get().status === "error") set({ status: "loading" });
    };
    /** The banner of a change that landed: Annuler, or the caller's action; none when nothing changed. */
    const banner = (result: ChangeResult, options?: ApplyOptions) => {
      if (options?.quiet) return;
      const undo = { label: "Annuler", onClick: () => void get().undo(result.changeId) };
      notify(result.message, result.changeId ? (options?.action ?? undo) : undefined);
    };

    return {
      status: "loading",
      weekStatus: {},
      busy: false,
      weeks: {},
      async load() {
        paintSaved();
        const mine = ++reads;
        try {
          const client = await getApi();
          const [today, week] = await Promise.all([client.today(), client.week(0)]);
          if (mine !== reads) return;
          set((s) => ({ status: "ready", today, weeks: { ...s.weeks, 0: week }, loadedAt: Date.now() }));
          saveFirstScreen({ today, week });
        } catch {
          // Offline with a copy from today: keep showing it rather than an error.
          if (!get().today) set({ status: "error" });
        }
      },
      async loadWeek(offset) {
        const status = (value: LoadStatus) => set((s) => ({ weekStatus: { ...s.weekStatus, [offset]: value } }));
        // A week already on screen stays there while it is read again.
        if (!get().weeks[offset]) status("loading");
        try {
          const week = await (await getApi()).week(offset);
          set((s) => ({ weeks: { ...s.weeks, [offset]: week }, weekStatus: { ...s.weekStatus, [offset]: "ready" } }));
        } catch {
          if (!get().weeks[offset]) status("error");
        }
      },
      async loadProgram() {
        if (!get().program) set({ programStatus: "loading" });
        try {
          set({ program: await (await getApi()).program(), programStatus: "ready" });
        } catch {
          if (!get().program) set({ programStatus: "error" });
        }
      },
      async refresh() {
        if (get().status === "error") return get().load();
        await read().catch(() => undefined);
      },
      async apply(action, options) {
        return guarded(async () => {
          try {
            const result = await action(await getApi());
            // Nothing changed: the previous change stays the one Annuler and Reggie's card undo.
            if (result.changeId) set({ lastChangeId: result.changeId });
            banner(result, options);
            readLater();
            return result;
          } catch (error) {
            notify(errorMessage(error));
            return undefined;
          }
        });
      },
      async run(action) {
        const done = await guarded(async () => {
          try {
            await action(await getApi());
            return true;
          } catch (error) {
            notify(errorMessage(error));
            return false;
          }
        });
        if (done) await read().catch(() => undefined);
        return done ?? false;
      },
      async sync(changeId) {
        set({ lastChangeId: changeId });
        await read();
      },
      async undo(changeId) {
        await guarded(async () => {
          try {
            await (await getApi()).undo(changeId);
            set({ lastChangeId: undefined });
            notify("Modification annulée");
            readLater();
          } catch (error) {
            notify(errorMessage(error));
          }
        });
      },
    };
  });
}

export const usePlan = createPlanStore(defaultApi, (message, action) => void defaultNotify(message, action));
