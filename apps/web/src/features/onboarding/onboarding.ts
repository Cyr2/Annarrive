import {
  type CreateEventInput,
  type FeasibilityInput,
  type Profile,
  type Program,
  painSiteSchema,
  type Unavailable,
} from "@annarrive/protocol";
import { addDays, minutesOf, timeOf, weekday } from "../../lib/date.ts";
import { checkIcsUrl } from "../program/program.ts";

/** The onboarding of docs/specs/produit.md as data and pure functions: a few questions per step, grouped. */

export const STEPS = [
  "welcome",
  "race",
  "target",
  "week",
  "hours",
  "strength",
  "health",
  "connect",
  "summary",
] as const;
export type Step = (typeof STEPS)[number];

export const COPY: Record<Step, { title: string; lead: string }> = {
  welcome: { title: "Annarrivé", lead: "Ton plan de course, rangé autour de tes cours et envoyé sur ta montre." },
  race: { title: "Ta course", lead: "La distance et la date. Sans course, on entretient ta forme." },
  target: { title: "Ton chrono", lead: "Choisis le temps que tu vises, ou simplement de la finir." },
  week: { title: "Ta semaine", lead: "Combien de fois tu cours, et les jours que tu gardes libres." },
  hours: { title: "Tes horaires", lead: "Tes courses se placent dans cette plage, jamais trop près du coucher." },
  strength: { title: "Ta muscu", lead: "Facultatif. Ajoute tes séances habituelles, tes courses se placent autour." },
  health: { title: "Ta santé", lead: "Pour démarrer à la bonne intensité. Tout se change ensuite dans Programme." },
  connect: { title: "Tes cours et tes alertes", lead: "Ton emploi du temps, puis les notifications." },
  summary: { title: "Ton plan est prêt", lead: "Touche une ligne pour la changer, puis lance-toi." },
};

export const DISTANCES = [
  { value: 5000, label: "5 km" },
  { value: 10000, label: "10 km" },
  { value: 21097.5, label: "Semi" },
  { value: 42195, label: "Marathon" },
] as const;
type DistanceM = (typeof DISTANCES)[number]["value"];
export type Race = DistanceM | "other" | "none";

export type StrengthDraft = { id: string; name: string; legs: boolean; day: number; start: string };
export type Draft = {
  race?: Race;
  otherKm: string;
  date: string;
  /** Her target in seconds, picked on the wheels; 0 until she turns them. */
  targetSec: number;
  /** "La finir": no target time. */
  finish: boolean;
  runsPerWeek: Profile["runsPerWeek"];
  bedtime: string;
  earliest: string;
  latestEnd: string;
  /** 1 = Monday to 7 = Sunday, as in the profile. */
  noRunDays: number[];
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
  targetSec: 0,
  finish: false,
  runsPerWeek: 3,
  bedtime: "23:00",
  earliest: "7:00",
  latestEnd: "21:30",
  noRunDays: [],
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

/** Target in minutes; undefined for "La finir" or wheels left at zero. */
export function targetOf(draft: Draft): number | undefined {
  return draft.finish || draft.targetSec <= 0 ? undefined : draft.targetSec / 60;
}

export function feasibilityInput(draft: Draft): FeasibilityInput | undefined {
  const distanceM = distanceOf(draft);
  const targetMin = targetOf(draft);
  if (!distanceM || !draft.date || targetMin === undefined) return undefined;
  return { distanceM, date: draft.date, targetMin };
}

function raceIssue(draft: Draft, today: string): string | undefined {
  if (draft.race === "none") return undefined;
  if (draft.race === undefined) return "Choisis ta distance, ou juste entretenir ta forme.";
  if (!distanceOf(draft)) return "Indique la distance en km.";
  if (!draft.date || draft.date <= today) return "Choisis la date de ta course.";
  return undefined;
}

/** Why "Continuer" is off on this step, or undefined when it can go on. */
export function issue(step: Step, draft: Draft, today: string): string | undefined {
  if (step === "race") return raceIssue(draft, today);
  if (step === "week" && 7 - draft.noRunDays.length < draft.runsPerWeek)
    return `Garde au moins ${draft.runsPerWeek} jours pour courir.`;
  if (step === "hours" && minutesOf(draft.latestEnd) <= minutesOf(draft.earliest))
    return "« Pas après » doit venir après « pas avant ».";
  if (step === "target" && !draft.finish && draft.targetSec <= 0)
    return "Fais tourner les roues, ou choisis de la finir.";
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
    draft.race === "none" || !distanceM ? null : { distanceM, date: draft.date, ...(targetMin ? { targetMin } : {}) };
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
  const ics = draft.icsUrl.trim() ? checkIcsUrl(draft.icsUrl).url : undefined;
  const site = painSiteSchema.safeParse(draft.zone?.toLowerCase());
  return {
    program: { goal },
    events,
    pain: draft.pain && site.success ? { reason: "pain", where: site.data, walking0to10: draft.level } : undefined,
    profile: {
      runsPerWeek: draft.runsPerWeek,
      earliest: padTime(draft.earliest),
      latestEnd: padTime(draft.latestEnd),
      noRunDays: [...draft.noRunDays].sort((a, b) => a - b),
      bedtime: padTime(draft.bedtime),
      useSleepHr: draft.useSleepHr,
      travelMin: 0,
      cycleTracking: draft.cycleTracking,
      ...(ics ? { icsUrl: ics } : {}),
    },
  };
}
