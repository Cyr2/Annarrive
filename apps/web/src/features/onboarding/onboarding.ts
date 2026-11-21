import {
  DEFAULT_TRAVEL_MIN,
  type DeclaredTime,
  type FeasibilityInput,
  IMPLAUSIBLE_TIME,
  type Profile,
  type ProfilePatch,
  type Program,
  plausibleTime,
} from "@annarrive/protocol";
import type { Item, Run } from "../../api/schemas.ts";
import { addDays, minutesOf, timeOf } from "../../lib/date.ts";
import { checkIcsUrl, raceDateOf } from "../program/program.ts";

/** The onboarding of docs/specs/produit.md as data and pure functions: one question per screen. */

export const STEPS = ["welcome", "race", "last", "week", "days", "consent", "ready"] as const;
export type Step = (typeof STEPS)[number];

/** The screens she answers, one progress dot each. */
export const QUESTIONS: Step[] = ["race", "last", "week", "days", "consent"];

export const COPY: Record<Step, { title: string; lead?: string }> = {
  welcome: { title: "Bienvenue, Anna", lead: "Cinq questions, puis ta première semaine." },
  race: { title: "Ta course" },
  last: { title: "Ta dernière course" },
  week: { title: "Ta semaine" },
  days: { title: "Tes journées" },
  consent: { title: "Ta montre et tes accords" },
  ready: { title: "Ta semaine est prête", lead: "Tes courses des sept prochains jours." },
};

export const DISTANCES = [
  { value: 5000, label: "5 km" },
  { value: 10000, label: "10 km" },
  { value: 21097.5, label: "Semi-marathon" },
  { value: 42195, label: "Marathon" },
] as const;
type DistanceM = (typeof DISTANCES)[number]["value"];
export type Race = DistanceM | "other" | "none";

/** Her last time as the level estimate reads it (algo.md F10): the same answers and dates as Réglages. */
export function declaredTimeOf(draft: Draft, today: string): DeclaredTime | undefined {
  if (draft.lastSec <= 0) return undefined;
  return { distanceM: draft.lastRace, minutes: draft.lastSec / 60, date: raceDateOf(draft.lastAgo, today) };
}

export type Draft = {
  race?: Race;
  otherKm: string;
  date: string;
  /** Her own name for the race, optional. */
  name: string;
  /** Her target in seconds, typed in the h and min boxes; 0: no target, she runs to finish. */
  targetSec: number;
  /** « Ta dernière course »: its distance, its time in seconds (0: none given), and roughly when. */
  lastRace: number;
  lastSec: number;
  /** One of `RACE_AGO`, in months. */
  lastAgo: string;
  runsPerWeek: Profile["runsPerWeek"];
  /** The days her long run may go on, 1 = Monday to 7 = Sunday. */
  longRunDays: number[];
  /** "" : automatic, the coach follows the hour she usually runs at. */
  preferredHour: string;
  bedtime: string;
  /** A timetable link she pastes when none is linked yet. */
  icsUrl: string;
  /** Minutes between the end of a run and the start of a class: shower, change, get there. */
  travelMin: number;
  useSleepHr: boolean;
};

/** Defaults of algo.md section 4.2; what she is not asked (hours, days off, muscu, pain) keeps the server's. */
export const EMPTY: Draft = {
  otherKm: "",
  date: "",
  name: "",
  targetSec: 0,
  lastRace: 21097.5,
  lastSec: 0,
  lastAgo: "0",
  runsPerWeek: 3,
  // The weekend is when a student is free for her longest run (algo.md S8).
  longRunDays: [6, 7],
  preferredHour: "",
  bedtime: "23:00",
  icsUrl: "",
  travelMin: DEFAULT_TRAVEL_MIN,
  useSleepHr: true,
};

/** "Autre": the plan follows the closest of the four distances the coach knows. */
export function distanceOf(draft: Draft): DistanceM | undefined {
  if (typeof draft.race === "number") return draft.race;
  const km = Number(draft.otherKm.replace(",", "."));
  if (draft.race !== "other" || !(km > 0 && km <= 100)) return undefined;
  const closest = (a: DistanceM, b: DistanceM) => (Math.abs(b / 1000 - km) < Math.abs(a / 1000 - km) ? b : a);
  return DISTANCES.map((d) => d.value).reduce<DistanceM>(closest, 5000);
}

/** Target in minutes; undefined when the boxes are left empty. */
export function targetOf(draft: Draft): number | undefined {
  return draft.race === "none" || draft.targetSec <= 0 ? undefined : draft.targetSec / 60;
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
  if (!draft.date || draft.date <= today) return "Choisis la date de ta course.";
  return undefined;
}

/** Why "Continuer" is off on this step, or undefined when it can go on. */
export function issue(step: Step, draft: Draft, today: string): string | undefined {
  if (step === "race") return raceIssue(draft, today);
  if (step === "last" && draft.lastSec > 0 && !plausibleTime(draft.lastRace, draft.lastSec / 60))
    return IMPLAUSIBLE_TIME;
  if (step === "days" && draft.icsUrl.trim() && !checkIcsUrl(draft.icsUrl).url) return checkIcsUrl(draft.icsUrl).error;
  return undefined;
}

/** The step before or after, kept inside the flow. */
export function nextStep(step: Step, direction: 1 | -1): Step {
  const i = STEPS.indexOf(step) + direction;
  return STEPS[Math.max(0, Math.min(i, STEPS.length - 1))] ?? step;
}

/** Her runs of the seven days after today, in order: the plan starts tomorrow (produit.md). */
export function firstRuns(items: Item[], today: string): Run[] {
  const end = addDays(today, 7);
  return items
    .filter((item): item is Run => item.kind === "run" && item.date > today && item.date <= end)
    .sort((a, b) => `${a.date}${a.start.padStart(5, "0")}`.localeCompare(`${b.date}${b.start.padStart(5, "0")}`));
}

/** "7:00" (how the app writes times) to "07:00" (what the server reads). */
const padTime = (time: string) => timeOf(minutesOf(time)).padStart(5, "0");

export type Payload = {
  /** Sent through the timetable route, which reads it: the profile patch does not carry it. */
  icsUrl?: string;
  program: Program;
  profile: ProfilePatch;
};

/** What "Préparer ma semaine" sends. The profile goes last: once stored, the server counts onboarding as done. */
export function toPayload(draft: Draft, today: string): Payload {
  const distanceM = distanceOf(draft);
  const targetMin = targetOf(draft);
  // No start time asked: the coach takes 9:00, when most road races start (algo.md P24).
  const goal =
    draft.race === "none" || !distanceM
      ? null
      : {
          distanceM,
          date: draft.date,
          ...(targetMin ? { targetMin } : {}),
          ...(draft.name.trim() ? { name: draft.name.trim() } : {}),
        };
  const declared = declaredTimeOf(draft, today);
  const ics = draft.icsUrl.trim() ? checkIcsUrl(draft.icsUrl).url : undefined;
  return {
    ...(ics ? { icsUrl: ics } : {}),
    program: { goal, ...(declared ? { declaredTime: declared } : {}) },
    profile: {
      runsPerWeek: draft.runsPerWeek,
      // None ticked: the coach's default (Sunday).
      ...(draft.longRunDays.length ? { preferredLongDays: [...draft.longRunDays].sort((a, b) => a - b) } : {}),
      ...(draft.preferredHour ? { preferredHour: padTime(draft.preferredHour) } : {}),
      bedtime: padTime(draft.bedtime),
      travelMin: draft.travelMin,
      useSleepHr: draft.useSleepHr,
    },
  };
}
