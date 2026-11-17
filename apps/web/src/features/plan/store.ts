import { create } from "zustand";
import { readFirstScreen, saveFirstScreen } from "../../api/cache.ts";
import type { Api } from "../../api/client.ts";
import { errorMessage } from "../../api/errors.ts";
import { api as defaultApi } from "../../api/index.ts";
import type { ChangeResult, Program, Today, Week } from "../../api/schemas.ts";
import { toIso } from "../../lib/date.ts";
import { whenIdle } from "../../lib/idle.ts";
import { notify as defaultNotify } from "../../ui/toast.ts";

/** `quiet`: no banner. `action`: replaces Annuler (settings show "Voir", docs/interactions.md). */
type ApplyOptions = { quiet?: boolean; action?: { label: string; onClick: () => void } };

type Notify = (message: string, action?: { label: string; onClick: () => void }) => void;

export type PlanState = {
  status: "loading" | "ready" | "error";
  today?: Today;
  weeks: Record<number, Week>;
  program?: Program;
  /** The latest change: the only one a Reggie change card can still undo. */
  lastChangeId?: string;
  load: () => Promise<void>;
  loadWeek: (offset: number) => Promise<void>;
  loadProgram: () => Promise<void>;
  /** Runs a change, refreshes what is on screen and shows the 6 s banner with Annuler. */
  apply: (action: (api: Api) => Promise<ChangeResult>, options?: ApplyOptions) => Promise<ChangeResult | undefined>;
  undo: (changeId: string) => Promise<void>;
  /** An action that is not a plan change (watch, feeling, timetable): run it, then re-read. */
  run: (action: (api: Api) => Promise<unknown>) => Promise<boolean>;
  /** Re-reads what is on screen after a change made elsewhere (Reggie), remembering it for Annuler. */
  sync: (changeId?: string) => Promise<void>;
};

export function createPlanStore(getApi: () => Promise<Api>, notify: Notify) {
  return create<PlanState>((set, get) => {
    const refresh = async () => {
      const client = await getApi();
      const offsets = Object.keys(get().weeks).map(Number);
      const [today, weeks, program] = await Promise.all([
        client.today(),
        Promise.all(offsets.map((o) => client.week(o))),
        get().program ? client.program() : Promise.resolve(undefined),
      ]);
      const byOffset: Record<number, Week> = {};
      offsets.forEach((offset, i) => {
        const week = weeks[i];
        if (week) byOffset[offset] = week;
      });
      set({ today, weeks: byOffset, program });
      if (byOffset[0]) saveFirstScreen({ today, week: byOffset[0] });
    };

    return {
      status: "loading",
      weeks: {},
      async load() {
        // The copy from the last launch paints at once; the server's answer replaces it a moment later.
        const saved = get().status === "loading" ? readFirstScreen(toIso(new Date())) : undefined;
        if (saved) set((s) => ({ status: "ready", today: saved.today, weeks: { ...s.weeks, 0: saved.week } }));
        try {
          const client = await getApi();
          const [today, week] = await Promise.all([client.today(), client.week(0)]);
          set((s) => ({ status: "ready", today, weeks: { ...s.weeks, 0: week } }));
          // Written once the screen is up: the copy is for the next launch, not for this paint.
          whenIdle(() => saveFirstScreen({ today, week }));
        } catch {
          // Offline with a copy from today: keep showing it rather than an error.
          if (!saved) set({ status: "error" });
        }
      },
      async loadWeek(offset) {
        const week = await (await getApi()).week(offset);
        set((s) => ({ weeks: { ...s.weeks, [offset]: week } }));
      },
      async loadProgram() {
        set({ program: await (await getApi()).program() });
      },
      async apply(action, options) {
        try {
          const result = await action(await getApi());
          await get().sync(result.changeId);
          const undo = { label: "Annuler", onClick: () => void get().undo(result.changeId) };
          // Nothing changed: no change to undo either.
          if (!options?.quiet) notify(result.message, result.changeId ? (options?.action ?? undo) : undefined);
          return result;
        } catch (error) {
          notify(errorMessage(error));
          return undefined;
        }
      },
      async run(action) {
        try {
          await action(await getApi());
          await refresh();
          return true;
        } catch (error) {
          notify(errorMessage(error));
          return false;
        }
      },
      async sync(changeId) {
        set({ lastChangeId: changeId });
        await refresh();
      },
      async undo(changeId) {
        try {
          await (await getApi()).undo(changeId);
          await get().sync(undefined);
          notify("Modification annulée");
        } catch (error) {
          notify(errorMessage(error));
        }
      },
    };
  });
}

export const usePlan = createPlanStore(defaultApi, (message, action) => void defaultNotify(message, action));
