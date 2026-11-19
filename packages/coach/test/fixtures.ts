import type { CalEvent, Session, Settings, State, Step, WeekState } from "../src/index.ts";
import { makeSession, paces } from "../src/index.ts";

/** Common context of the M4 tests: week of Monday 2026-11-23, legs on Tuesday 18:00 to 19:00. */
export const MONDAY = "2026-11-23";
export const P40 = paces(40);

export const SETTINGS: Settings = {
  runsPerWeek: 4,
  earliest: "07:00",
  latestEnd: "22:30",
  noRunDays: [],
  bedtime: "23:00",
  useSleepHr: true,
  travelMin: 0,
};

export const LEGS: CalEvent = {
  id: "legs",
  kind: "strength",
  start: "2026-11-24T18:00",
  end: "2026-11-24T19:00",
  legs: true,
  manual: true,
};

export const block = (id: string, start: string, end: string, kind: CalEvent["kind"] = "unavailable"): CalEvent => ({
  id,
  kind,
  start,
  end,
  manual: kind !== "class" && kind !== "exam",
});

const easyStep = (durMin: number, rpe = 3): Step => ({
  kind: "work",
  durMin,
  zone: "E",
  target: { paceSKm: [P40.E, P40.E], rpe },
});

export const easy = (id: string, start: string, durMin = 45, extra: Partial<Session> = {}): Session =>
  makeSession("E", [easyStep(durMin)], { id, start, ...extra });

export const long = (id: string, start: string, durMin = 90, extra: Partial<Session> = {}): Session =>
  makeSession("L", [easyStep(durMin, 4)], { id, start, ...extra });

/** A threshold Q of `durMin` minutes in one block. */
export const hard = (id: string, start: string, durMin = 60, extra: Partial<Session> = {}): Session =>
  makeSession("T", [{ kind: "work", durMin, zone: "T", target: { paceSKm: [P40.T, P40.T], rpe: 7 } }], {
    id,
    start,
    ...extra,
  });

/** 6 × 800 m at I pace for VDOT 40 (3.75 min per fraction), recoveries of the same length. */
export const sixBy800 = (id = "q", start = ""): Session => {
  const frac = (0.8 * P40.I) / 60;
  const steps: Step[] = [
    { ...easyStep(15), kind: "warmup" },
    { kind: "work", durMin: frac, distM: 800, reps: 6, zone: "I", target: { paceSKm: [P40.I, P40.I], rpe: 8 } },
    { kind: "recover", durMin: frac, reps: 5, zone: "E", target: { paceSKm: [P40.E, P40.E], rpe: 2 } },
    { ...easyStep(10), kind: "cooldown" },
  ];
  return makeSession("I", steps, { id, start });
};

export const week = (sessions: Session[], cal: CalEvent[] = [LEGS], settings: Settings = SETTINGS): WeekState => ({
  monday: MONDAY,
  sessions,
  cal,
  settings,
});

export const state = (sessions: Session[], cal: CalEvent[] = [LEGS], extra: Partial<State> = {}): State => ({
  ...week(sessions, cal),
  health: { kind: "ok" },
  feels: [],
  vdot: 40,
  ...extra,
});

/** Whole days blocked from 06:00 to 23:30. */
export const blockDays = (dates: string[]): CalEvent[] =>
  dates.map((d) => block(`busy-${d}`, `${d}T06:00`, `${d}T23:30`));
