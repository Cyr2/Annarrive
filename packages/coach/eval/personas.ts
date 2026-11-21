import type { Activity, CalEvent, Goal, PaceZone, Settings } from "../src/index.ts";
import { addDays, at, weekDates } from "../src/index.ts";
import { marathonReturn } from "../test/marathon-return.ts";

/** Monday the bench starts on; the programme starts the Sunday before, at the weekly build (algo.md §0.1). */
export const START_MONDAY = "2026-11-23";
export const PLAN_START = "2026-11-22";

/** Deterministic PRNG (mulberry32): the bench must give the same result on every run. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Strength = { day: number; start: string; end: string; legs: boolean };

/** What happens to her, week by week (week 1 = START_MONDAY). Days are 0 = Monday. */
export type Script = {
  /** Fever on that day: no run until she feels better `days` days later. */
  sick?: { week: number; day: number; days: number };
  /** Every n-th planned session is skipped (explicitly every other time, silently otherwise). */
  skipEvery?: number;
  /** Overreaching: short nights, high resting HR, everything feels hard; performance drops 1.5 VDOT. */
  overreach?: { from: number; to: number };
  /** How much of the gap to her true pace she runs when she is faster than the target (0 = sticks to target). */
  eagerness?: number;
  /** Weeks where a class is added on Thursday 17:00 to 19:00, announced on Wednesday 08:00 (EV15). */
  movedClass?: number[];
  /** One short night every week (single signal: the coach must not react, D2). */
  oneShortNight?: boolean;
  /** She runs her footings and long runs in this zone whatever their target (the most common error: too fast). */
  easyAs?: PaceZone;
  /** Once a week, a footing followed by a hard session within 48 h becomes a tempo: 20 min at threshold inside. */
  tempoForEasy?: boolean;
  /** Once a week from Wednesday, an easy run of this many minutes on a day without a session. */
  extraRun?: number;
  /** She stops her long runs at this share of their planned length. */
  cutLong?: number;
};

export type Persona = {
  id: string;
  label: string;
  goal: NonNullable<Goal>;
  settings: Settings;
  /** Her real level, unknown to the coach. */
  trueVdot: number;
  hrMax: number;
  /** What the onboarding gives the coach (F10). */
  declared?: { distM: number; tMin: number; date?: string };
  vo2max?: number;
  /** 8 weeks of runs before the programme. `thresholdLaps`: two runs with 4 × 1 km at T heart rate (F-23). */
  history: { runsPerWeek: number; minPerWeek: number; thresholdLaps?: boolean };
  /** Her real runs before the programme, in place of the 8 synthetic weeks of `history`. */
  runs?: Activity[];
  weeks: number;
  timetable: "unistra" | "office" | "none";
  strength: Strength[];
  /** Revision blocks on Saturday and Sunday afternoons in these weeks. */
  revisionWeeks?: number[];
  script: Script;
};

const BASE: Settings = {
  runsPerWeek: 4,
  earliest: "07:00",
  latestEnd: "21:30",
  noRunDays: [],
  bedtime: "23:00",
  preferredLongDays: [5, 6],
  useSleepHr: true,
  travelMin: 15,
};

const ANNA_STRENGTH: Strength[] = [
  { day: 0, start: "18:00", end: "19:15", legs: true },
  { day: 2, start: "12:30", end: "13:30", legs: false },
  { day: 4, start: "17:30", end: "18:45", legs: true },
];

const anna: Persona = {
  id: "anna",
  label: "Anna, semi en 1:50 (Unistra, muscu 3×, révisions)",
  goal: { distanceM: 21097.5, date: "2027-02-14", targetMin: 110 },
  settings: BASE,
  trueVdot: 41,
  hrMax: 192,
  declared: { distM: 21097.5, tMin: 112, date: "2026-10-04" },
  vo2max: 36,
  history: { runsPerWeek: 3, minPerWeek: 165, thresholdLaps: true },
  weeks: 13,
  timetable: "unistra",
  strength: ANNA_STRENGTH,
  revisionWeeks: [4, 5, 6],
  script: { movedClass: [2, 5, 8], oneShortNight: true },
};

export const PERSONAS: Persona[] = [
  anna,
  {
    id: "debutant-10k",
    label: "Débutant, 10 km pour finir, 3 sorties",
    goal: { distanceM: 10000, date: "2027-01-17" },
    settings: { ...BASE, runsPerWeek: 3, preferredLongDays: [6] },
    trueVdot: 33,
    hrMax: 188,
    declared: { distM: 5000, tMin: 32 },
    history: { runsPerWeek: 2, minPerWeek: 70 },
    weeks: 9,
    timetable: "office",
    strength: [],
    script: {},
  },
  {
    id: "marathon",
    label: "Marathonien, 5 sorties, 3:15 visé",
    goal: { distanceM: 42195, date: "2027-04-18", targetMin: 195 },
    settings: { ...BASE, runsPerWeek: 5, earliest: "06:30", latestEnd: "21:30", preferredLongDays: [6] },
    trueVdot: 48,
    hrMax: 186,
    declared: { distM: 21097.5, tMin: 93, date: "2026-09-27" },
    history: { runsPerWeek: 5, minPerWeek: 300 },
    weeks: 6,
    timetable: "office",
    strength: [{ day: 2, start: "19:00", end: "20:00", legs: true }],
    script: {},
  },
  {
    ...anna,
    id: "malade",
    label: "Anna, fièvre le mardi de la semaine 2",
    weeks: 6,
    script: { sick: { week: 2, day: 1, days: 4 } },
  },
  {
    ...anna,
    id: "sauteuse",
    label: "Anna, saute une séance sur trois",
    weeks: 6,
    script: { skipEvery: 3 },
  },
  {
    ...anna,
    id: "plus-forte",
    label: "Coureuse plus forte que son estimation (VDOT 36 annoncé, 41 réel)",
    trueVdot: 41,
    declared: { distM: 10000, tMin: 54, date: "2026-07-05" },
    history: { runsPerWeek: 3, minPerWeek: 165 },
    weeks: 6,
    script: { eagerness: 1 },
  },
  {
    ...anna,
    id: "surmenage",
    label: "Anna en surmenage, semaines 2 à 4",
    weeks: 6,
    script: { overreach: { from: 2, to: 4 } },
  },
  // Runners who do not follow the plan: the app must adapt to what they ran, never make up what they skipped.
  { ...anna, id: "trop-vite", label: "Anna court ses footings à l'allure marathon", weeks: 6, script: { easyAs: "M" } },
  {
    ...anna,
    id: "en-plus",
    label: "Anna ajoute une course de 40 min chaque semaine",
    weeks: 6,
    script: { extraRun: 40 },
  },
  {
    ...anna,
    id: "tempo",
    label: "Anna fait un tempo au lieu d'un footing chaque semaine",
    weeks: 6,
    script: { tempoForEasy: true },
  },
  {
    ...anna,
    id: "longue-coupee",
    label: "Anna coupe ses sorties longues aux deux tiers",
    weeks: 6,
    script: { cutLong: 0.65 },
  },
  // Audit of 21/11/2026: a year of Garmin history, a 4:06 marathon 4 weeks ago, a new half in 19 weeks.
  ...[true, false].map(
    (lastTempo): Persona => ({
      ...anna,
      id: lastTempo ? "retour-marathon" : "retour-marathon-sans-seuil",
      label: `Anna 4 semaines après un marathon en 4:06, semi en 1:48 visé${lastTempo ? "" : ", dernier seuil à 7 semaines"}`,
      goal: { distanceM: 21097.5, date: "2027-04-04", targetMin: 108 },
      trueVdot: 40.5,
      declared: undefined,
      vo2max: 45,
      runs: marathonReturn({ lastTempo }),
      weeks: 20,
      revisionWeeks: [],
      script: { oneShortNight: true },
    }),
  ),
];

const ev = (
  id: string,
  kind: CalEvent["kind"],
  date: string,
  start: string,
  end: string,
  legs?: boolean,
): CalEvent => ({
  id,
  kind,
  start: at(date, start),
  end: at(date, end),
  manual: kind !== "class" && kind !== "exam",
  ...(legs === undefined ? {} : { legs }),
});

const UNISTRA_SLOTS: [string, string][] = [
  ["08:00", "10:00"],
  ["10:15", "12:15"],
  ["13:30", "15:30"],
  ["15:45", "17:45"],
  ["18:00", "20:00"],
];
const HOLIDAYS: [string, string] = ["2026-12-19", "2027-01-03"];
const EXAMS = ["2027-01-04", "2027-01-06", "2027-01-08"];

/** Unistra-like: a different timetable every week, holidays at Christmas, exams the first week of January. */
function unistraWeek(monday: string, next: () => number): CalEvent[] {
  return weekDates(monday)
    .slice(0, 5)
    .flatMap((date) => {
      if (date >= HOLIDAYS[0] && date <= HOLIDAYS[1]) return [];
      if (EXAMS.includes(date)) return [ev(`exam-${date}`, "exam", date, "09:00", "12:00")];
      // The evening slot is rare: one day in five at most.
      return UNISTRA_SLOTS.filter((_, i) => next() < (i === 4 ? 0.15 : 0.6)).map(([s, e]) =>
        ev(`class-${date}-${s}`, "class", date, s, e),
      );
    });
}

/** Her calendar for every week of the bench, plus the week after (neighbour of the last build). */
export function calendar(p: Persona): CalEvent[] {
  const next = rng(p.id.length * 7919 + 17);
  return [...Array(p.weeks + 1).keys()].flatMap((w) => {
    const monday = addDays(START_MONDAY, 7 * w);
    const days = weekDates(monday);
    const classes =
      p.timetable === "unistra"
        ? unistraWeek(monday, next)
        : p.timetable === "office"
          ? days.slice(0, 5).map((d) => ev(`work-${d}`, "class", d, "08:30", "17:30"))
          : [];
    const strength = p.strength.map((s) =>
      ev(`gym-${days[s.day]}`, "strength", days[s.day] ?? monday, s.start, s.end, s.legs),
    );
    const revision = p.revisionWeeks?.includes(w + 1)
      ? [5, 6].map((d) => ev(`rev-${days[d]}`, "revision", days[d] ?? monday, "14:00", "18:00"))
      : [];
    return [...classes, ...strength, ...revision];
  });
}
