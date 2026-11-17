import type { Feasibility } from "@talaria/protocol";
import { create } from "zustand";
import { type OnboardingApi, onboardingApi } from "../../api/onboarding.ts";
import { toIso } from "../../lib/date.ts";
import { DONE_KEY } from "./done.ts";
import { type Draft, EMPTY, feasibilityInput, issue, nextStep, type Step, toPayload } from "./onboarding.ts";

type Storage = Pick<globalThis.Storage, "setItem">;

export type OnboardingState = {
  /** `checking` until the server answers, `tour` for the bubbles over Aujourd'hui. */
  phase: "checking" | "hidden" | "flow" | "tour";
  step: Step;
  /** Which way the screens slide. */
  direction: 1 | -1;
  draft: Draft;
  today: string;
  /** Undefined until asked, null when the server cannot tell yet. */
  verdict?: Feasibility["verdict"];
  linked?: boolean;
  sending: boolean;
  error?: string;
  /** Calls of "C'est parti" already done, so a retry never adds the muscu twice. */
  sent: number;
  start: () => Promise<void>;
  update: (patch: Partial<Draft>) => void;
  next: () => void;
  back: () => void;
  /** From the summary, straight to the step of a line she wants to change. */
  goTo: (step: Step) => void;
  checkTarget: () => Promise<void>;
  checkTimetable: () => Promise<void>;
  submit: () => Promise<boolean>;
  endTour: () => void;
};

const FAILED = "Ça n'a pas marché. Vérifie ta connexion et réessaie.";

export function createOnboardingStore(
  getApi: () => Promise<OnboardingApi>,
  storage: Storage | undefined,
  today = toIso(new Date()),
) {
  const remember = () => {
    try {
      storage?.setItem(DONE_KEY, "done");
    } catch {
      // Private mode: the server check still hides onboarding next time.
    }
  };

  return create<OnboardingState>((set, get) => ({
    phase: "checking",
    step: "welcome",
    direction: 1,
    draft: EMPTY,
    today,
    sending: false,
    sent: 0,

    async start() {
      try {
        const done = await (await getApi()).done();
        if (done) remember();
        set({ phase: done ? "hidden" : "flow" });
      } catch {
        // Unreachable server: try again on the next launch rather than block the app.
        set({ phase: "hidden" });
      }
    },

    update(patch) {
      const target =
        "race" in patch || "otherKm" in patch || "date" in patch || "targetSec" in patch || "finish" in patch;
      set((s) => ({ draft: { ...s.draft, ...patch }, ...(target ? { verdict: undefined } : {}) }));
    },

    next() {
      const { step, draft } = get();
      if (issue(step, draft, get().today)) return;
      set({ step: nextStep(step, draft, 1), direction: 1 });
    },

    back() {
      const { step, draft } = get();
      set({ step: nextStep(step, draft, -1), direction: -1 });
    },

    goTo(step) {
      set({ step, direction: -1 });
    },

    async checkTarget() {
      const input = feasibilityInput(get().draft);
      if (!input) return set({ verdict: undefined });
      try {
        const verdict = await (await getApi()).feasibility(input);
        // Only if she has not typed something else meanwhile.
        if (JSON.stringify(feasibilityInput(get().draft)) === JSON.stringify(input)) set({ verdict });
      } catch {
        set({ verdict: null });
      }
    },

    async checkTimetable() {
      try {
        set({ linked: await (await getApi()).timetableLinked() });
      } catch {
        set({ linked: false });
      }
    },

    async submit() {
      const client = await getApi();
      const { program, events, pain, profile } = toPayload(get().draft, get().today);
      // shortcut: editing the muscu after a failed send can shift these indexes; fine for a one-time flow.
      const calls = [
        () => client.saveProgram(program),
        ...events.map((event) => () => client.addEvent(event)),
        ...(pain ? [() => client.reportPain(pain)] : []),
        () => client.saveProfile(profile),
      ];
      set({ sending: true, error: undefined });
      try {
        for (const call of calls.slice(get().sent)) {
          await call();
          set((s) => ({ sent: s.sent + 1 }));
        }
      } catch {
        set({ sending: false, error: FAILED });
        return false;
      }
      set({ sending: false, phase: "tour" });
      return true;
    },

    endTour() {
      remember();
      set({ phase: "hidden" });
    },
  }));
}

function localStore(): Storage | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

export const useOnboarding = createOnboardingStore(onboardingApi, localStore());
