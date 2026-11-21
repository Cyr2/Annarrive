import {
  type CreateEventInput,
  DEFAULT_TRAVEL_MIN,
  type DeclaredTime,
  type FeasibilityInput,
  IMPLAUSIBLE_TIME,
  type Profile,
  type Program,
  painSiteSchema,
  plausibleTime,
  type Unavailable,
} from "@annarrive/protocol";
import { addDays, daysBetween, minutesOf, timeOf, weekday } from "../../lib/date.ts";
import { checkIcsUrl } from "../program/program.ts";

/** The onboarding of docs/specs/produit.md as data and pure functions: a few questions per step, grouped. */

export const STEPS = [
  "welcome",
  "race",
  "last",
  "target",
  "week",
  "hours",
  "strength",
  "health",
  "connect",
  "summary",
] as const;
export type Step = (typeof STEPS)[number];

export const COPY: Record<Step, { title: string; lead?: string }> = {
  welcome: { title: "Annarrivé", lead: "Ton coach de course à pied." },
  race: { title: "Ton objectif" },
  last: {
    title: "Ton dernier chrono",
    lead: "Facultatif. Un chrono récent, ou ton temps estimé, règle tes allures dès la première semaine.",
  },
  target: { title: "Ton chrono" },
  week: { title: "Ta semaine" },
  hours: { title: "Tes horaires", lead: "Tes courses se placent dans cette plage, jamais trop près du coucher." },
  strength: { title: "Ta muscu", lead: "Facultatif. Ajoute tes séances habituelles, tes courses se placent autour." },
  health: { title: "Ta santé", lead: "Pour démarrer à la bonne intensité. Tout se change ensuite dans Programme." },
  connect: { title: "Tes cours et tes notifications" },
  summary: { title: "Tout est bon ?", lead: "Touche une ligne pour la changer, puis lance-toi." },
};

export const DISTANCES = [
  { value: 5000, label: "5 km" },
  { value: 10000, label: "10 km" },
  { value: 21097.5, label: "Semi-marathon" },
  { value: 42195, label: "Marathon" },
] as const;
type DistanceM = (typeof DISTANCES)[number]["value"];
export type Race = DistanceM | "other" | "none";

export const LAST_WHEN = [
  { value: "recent", label: "Il y a moins de 3 mois", daysAgo: 45 },
  { value: "months", label: "Il y a 3 à 6 mois", daysAgo: 135 },
  { value: "older", label: "Il y a plus de 6 mois", daysAgo: 270 },
  { value: "estimate", label: "C'est une estimation", daysAgo: undefined },
] as const;
export type LastWhen = (typeof LAST_WHEN)[number]["value"];

/** Her last time as the level estimate reads it (algo.md F10): a date roughly when, none for an estimate. */
export function declaredTimeOf(draft: Draft, today: string): DeclaredTime | undefined {
  return lastTimeOf(draft.lastRace, draft.lastSec, draft.lastWhen, today);
}

/** Shared by onboarding and Programme: the distance, the time in seconds (0: none), and roughly when. */
export function lastTimeOf(
  distanceM: number,
  seconds: number,
  when: LastWhen,
  today: string,
): DeclaredTime | undefined {
  if (seconds <= 0) return undefined;
  const daysAgo = LAST_WHEN.find((w) => w.value === when)?.daysAgo;
  return { distanceM, minutes: seconds / 60, ...(daysAgo === undefined ? {} : { date: addDays(today, -daysAgo) }) };
}

/** Back from a stored time to the answer she gave: the closest of the four « Quand ». */
export function whenOf(date: string | undefined, today: string): LastWhen {
  if (date === undefined) return "estimate";
  const ago = daysBetween(date, today);
  return ago < 90 ? "recent" : ago < 182 ? "months" : "older";
}

export type StrengthDraft = { id: string; name: string; legs: boolean; day: number; start: string };
export type Draft = {
  race?: Race;
  otherKm: string;
  date: string;
  /** When the race starts: the race-day run is placed at this hour. */
  startTime: string;
  /** Her target in seconds, typed in the h and min boxes; 0 until she types one. */
  targetSec: number;
  /** "Juste finir": no target time. */
  finish: boolean;
  /** « Ton dernier chrono »: its distance, its time in seconds (0: none given), and roughly when. */
  lastRace: DistanceM;
  lastSec: number;
  lastWhen: LastWhen;
  runsPerWeek: Profile["runsPerWeek"];
  bedtime: string;
  earliest: string;
  latestEnd: string;
  /** 1 = Monday to 7 = Sunday, as in the profile. */
  noRunDays: number[];
  /** The days her long run may go on, 1 = Monday to 7 = Sunday. */
  longRunDays: number[];
  strength: StrengthDraft[];
  pain: boolean;
  zone?: string;
  level: number;
  useSleepHr: boolean;
  cycleTracking: boolean;
  /** A timetable link she pastes when none is linked yet. */
  icsUrl: string;
};

/** Defaults of algo.md section 4.2 (the server's `defaultProfile`). */
export const EMPTY: Draft = {
  otherKm: "",
  date: "",
  // Most road races start in the morning (algo.md P24).
  startTime: "9:00",
  targetSec: 0,
  finish: false,
  lastRace: 21097.5,
  lastSec: 0,
  lastWhen: "recent",
  runsPerWeek: 3,
  bedtime: "23:00",
  earliest: "7:00",
  latestEnd: "21:30",
  noRunDays: [],
  // The weekend is when a student is free for her longest run (algo.md S8).
  longRunDays: [6, 7],
  strength: [],
  pain: false,
  level: 2,
  useSleepHr: true,
  cycleTracking: false,
  icsUrl: "",
};

/** "Autre": the plan follows the closest of the four distances the coach knows. */
export function distanceOf(draft: Draft): DistanceM | undefined {
  if (typeof draft.race === "number") return draft.race;
  const km = Number(draft.otherKm.replace(",", "."));
  if (draft.race !== "other" || !(km > 0 && km <= 100)) return undefined;
  const closest = (a: DistanceM, b: DistanceM) => (Math.abs(b / 1000 - km) < Math.abs(a / 1000 - km) ? b : a);
  return DISTANCES.map((d) => d.value).reduce<DistanceM>(closest, 5000);
}

/** Target in minutes; undefined for "Juste finir" or boxes left empty. */
export function targetOf(draft: Draft): number | undefined {
  return draft.finish || draft.targetSec <= 0 ? undefined : draft.targetSec / 60;
}

export function feasibilityInput(draft: Draft, today: string): FeasibilityInput | undefined {
  const distanceM = distanceOf(draft);
  const targetMin = targetOf(draft);
  if (!distanceM || !draft.date || targetMin === undefined) return undefined;
  const declaredTime = declaredTimeOf(draft, today);
  return { distanceM, date: draft.date, targetMin, ...(declaredTime ? { declaredTime } : {}) };
}

function raceIssue(draft: Draft, today: string): string | undefined {
  if (draft.race === "none") return undefined;
  if (draft.race === undefined) return "Choisis une distance, ou « Pas d'objectif ».";
  if (!distanceOf(draft)) return "Indique la distance en km.";
  if (!draft.date || draft.date <= today) return "Choisis la date de ton objectif.";
  return undefined;
}

/** Why "Continuer" is off on this step, or undefined when it can go on. */
export function issue(step: Step, draft: Draft, today: string): string | undefined {
  if (step === "race") return raceIssue(draft, today);
  if (step === "week" && 7 - draft.noRunDays.length < draft.runsPerWeek)
    return `Garde au moins ${draft.runsPerWeek} jours pour courir.`;
  if (step === "hours" && minutesOf(draft.latestEnd) <= minutesOf(draft.earliest))
    return "L'heure de fin doit venir après l'heure de début.";
  if (step === "last" && draft.lastSec > 0 && !plausibleTime(draft.lastRace, draft.lastSec / 60))
    return IMPLAUSIBLE_TIME;
  if (step === "target" && !draft.finish && draft.targetSec <= 0)
    return "Écris ton chrono, ou choisis « Juste finir ».";
  if (step === "strength" && draft.strength.some((s) => !s.name.trim())) return "Donne un nom à chaque séance.";
  if (step === "health" && draft.pain && !draft.zone) return "Dis où tu as mal.";
  if (step === "connect" && draft.icsUrl.trim() && !checkIcsUrl(draft.icsUrl).url)
    return checkIcsUrl(draft.icsUrl).error;
  return undefined;
}

/** The steps she answers (welcome and summary aside), for the progress bar. */
export function questionSteps(draft: Draft): Step[] {
  return STEPS.filter((s) => s !== "welcome" && s !== "summary" && !(s === "target" && draft.race === "none"));
}

/** The target step only makes sense with a race. */
export function nextStep(step: Step, draft: Draft, direction: 1 | -1): Step {
  let i = STEPS.indexOf(step) + direction;
  if (STEPS[i] === "target" && draft.race === "none") i += direction;
  return STEPS[Math.max(0, Math.min(i, STEPS.length - 1))] ?? step;
}

/** First date on or after `today` that falls on `day` (1 = Monday). */
export function firstDay(today: string, day: number): string {
  return addDays(today, (day - 1 - weekday(today) + 7) % 7);
}

// shortcut: strength lasts 60 min, she can change it in Semaine; ask the duration if she often edits it.
const STRENGTH_MIN = 60;
const LAST_MINUTE = 23 * 60 + 59;

/** "7:00" (how the app writes times) to "07:00" (what the server reads). */
const hhmm = (minutes: number) => timeOf(minutes).padStart(5, "0");
const padTime = (time: string) => hhmm(minutesOf(time));

export type Payload = {
  /** Sent through the timetable route, which reads it: the profile patch does not carry it. */
  icsUrl?: string;
  program: Program;
  events: CreateEventInput[];
  pain?: Unavailable;
  profile: Profile;
};

/** What "C'est parti" sends. The profile goes last: once stored, the server counts onboarding as done. */
export function toPayload(draft: Draft, today: string): Payload {
  const distanceM = distanceOf(draft);
  const targetMin = targetOf(draft);
  const goal =
    draft.race === "none" || !distanceM
      ? null
      : {
          distanceM,
          date: draft.date,
          startTime: padTime(draft.startTime),
          ...(targetMin ? { targetMin } : {}),
        };
  const events = draft.strength.map((s): CreateEventInput => {
    const date = firstDay(today, s.day);
    const start = minutesOf(s.start);
    return {
      kind: "strength",
      title: s.name.trim(),
      start: `${date}T${hhmm(start)}`,
      // A late session stops at midnight rather than ending the next day.
      end: `${date}T${hhmm(Math.min(start + STRENGTH_MIN, LAST_MINUTE))}`,
      legs: s.legs,
      recurrence: "weekly",
    };
  });
  const declared = declaredTimeOf(draft, today);
  const longDays = [...draft.longRunDays].filter((d) => !draft.noRunDays.includes(d)).sort((a, b) => a - b);
  const ics = draft.icsUrl.trim() ? checkIcsUrl(draft.icsUrl).url : undefined;
  const site = painSiteSchema.safeParse(draft.zone?.toLowerCase());
  return {
    ...(ics ? { icsUrl: ics } : {}),
    program: { goal, ...(declared ? { declaredTime: declared } : {}) },
    events,
    pain: draft.pain && site.success ? { reason: "pain", where: site.data, walking0to10: draft.level } : undefined,
    profile: {
      runsPerWeek: draft.runsPerWeek,
      earliest: padTime(draft.earliest),
      latestEnd: padTime(draft.latestEnd),
      noRunDays: [...draft.noRunDays].sort((a, b) => a - b),
      // A long-run day she also keeps free of runs is dropped; none left: the coach's default (Sunday).
      ...(longDays.length ? { preferredLongDays: longDays } : {}),
      bedtime: padTime(draft.bedtime),
      useSleepHr: draft.useSleepHr,
      travelMin: DEFAULT_TRAVEL_MIN,
    },
  };
}
