import { create } from "zustand";
import type { Api } from "../../api/client.ts";
import { api as defaultApi } from "../../api/index.ts";
import type { ChangeResult, Program, Today, Week } from "../../api/schemas.ts";
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

const FAILED = "Ça n'a pas marché. Réessaie dans un instant.";

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
    };

    return {
      status: "loading",
      weeks: {},
      async load() {
        try {
          const client = await getApi();
          const [today, week] = await Promise.all([client.today(), client.week(0)]);
          set((s) => ({ status: "ready", today, weeks: { ...s.weeks, 0: week } }));
        } catch {
          set({ status: "error" });
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
          if (!options?.quiet) notify(result.message, options?.action ?? undo);
          return result;
        } catch {
          notify(FAILED);
          return undefined;
        }
      },
      async run(action) {
        try {
          await action(await getApi());
          await refresh();
          return true;
        } catch {
          notify(FAILED);
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
        } catch {
          notify(FAILED);
        }
      },
    };
  });
}

export const usePlan = createPlanStore(defaultApi, (message, action) => void defaultNotify(message, action));
