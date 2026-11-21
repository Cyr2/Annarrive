import type { Feasibility } from "@annarrive/protocol";
import { create } from "zustand";
import { type OnboardingApi, onboardingApi } from "../../api/onboarding.ts";
import { toIso } from "../../lib/date.ts";
import { DONE_KEY } from "./done.ts";
import { type Draft, EMPTY, feasibilityInput, issue, nextStep, type Step, toPayload } from "./onboarding.ts";

type Storage = Pick<globalThis.Storage, "setItem">;

export type OnboardingState = {
  /** `checking` until the server answers. */
  phase: "checking" | "hidden" | "flow";
  step: Step;
  /** Which way the screens slide. */
  direction: 1 | -1;
  draft: Draft;
  today: string;
  /** Undefined until asked, null when the server cannot tell yet. */
  verdict?: Feasibility["verdict"];
  linked?: boolean;
  /** Her Garmin as the server sees it; undefined until asked. */
  watch?: boolean;
  sending: boolean;
  error?: string;
  /** Calls of "Préparer ma semaine" already done, so a retry never sends one twice. */
  sent: number;
  start: () => Promise<void>;
  update: (patch: Partial<Draft>) => void;
  next: () => void;
  back: () => void;
  /** « Je n'en ai pas »: no last race, straight to the next question. */
  skipLast: () => void;
  checkTarget: () => Promise<void>;
  checkTimetable: () => Promise<void>;
  checkWatch: () => Promise<void>;
  /** Sends her answers, then shows her first week. */
  submit: () => Promise<boolean>;
  /** « Voir aujourd'hui »: onboarding is over on this phone too. */
  finish: () => void;
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
  const ask = async <T>(question: (api: OnboardingApi) => Promise<T>, fallback: T) => {
    try {
      return await question(await getApi());
    } catch {
      return fallback;
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
      // Unreachable server: try again on the next launch rather than block the app.
      const done = await ask((api) => api.done(), undefined);
      if (done) remember();
      set({ phase: done === false ? "flow" : "hidden" });
    },

    update(patch) {
      const target = "race" in patch || "otherKm" in patch || "date" in patch || "targetSec" in patch;
      set((s) => ({ draft: { ...s.draft, ...patch }, ...(target ? { verdict: undefined } : {}) }));
    },

    next() {
      const { step, draft } = get();
      if (issue(step, draft, get().today)) return;
      set({ step: nextStep(step, 1), direction: 1 });
    },

    back() {
      // Her week is built: there is no question left to go back to.
      if (get().step === "ready") return;
      set({ step: nextStep(get().step, -1), direction: -1 });
    },

    skipLast() {
      get().update({ lastSec: 0 });
      get().next();
    },

    async checkTarget() {
      const input = feasibilityInput(get().draft, get().today);
      if (!input) return set({ verdict: undefined });
      const verdict = await ask((api) => api.feasibility(input), null);
      // Only if she has not typed something else meanwhile.
      if (JSON.stringify(feasibilityInput(get().draft, get().today)) === JSON.stringify(input)) set({ verdict });
    },

    async checkTimetable() {
      set({ linked: await ask((api) => api.timetableLinked(), false) });
    },

    async checkWatch() {
      set({ watch: await ask((api) => api.watchLinked(), false) });
    },

    async submit() {
      const client = await getApi();
      const { icsUrl, program, profile } = toPayload(get().draft, get().today);
      // shortcut: a link added after a failed send shifts these indexes; fine for a one-time flow.
      const calls = [
        // Classes first, so the plan built from the program already goes around them.
        ...(icsUrl ? [() => client.linkTimetable(icsUrl)] : []),
        () => client.saveProgram(program),
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
      set({ sending: false, step: "ready", direction: 1 });
      return true;
    },

    finish() {
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
