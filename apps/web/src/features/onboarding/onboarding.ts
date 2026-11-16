import {
  type CreateEventInput,
  type FeasibilityInput,
  type Profile,
  type Program,
  painSiteSchema,
  type Unavailable,
} from "@talaria/protocol";
import { addDays, minutesOf, timeOf, weekday } from "../../lib/date.ts";

/** The onboarding of docs/specs/produit.md as data and pure functions: one question per step. */

export const STEPS = [
  "welcome",
  "race",
  "target",
  "runs",
  "bedtime",
  "limits",
  "strength",
  "pain",
  "consents",
  "timetable",
  "notifications",
  "summary",
] as const;
export type Step = (typeof STEPS)[number];

export const COPY: Record<Step, { title: string; lead: string }> = {
  welcome: { title: "Talaria", lead: "Ton plan de course, placé autour de tes cours et envoyé sur ta montre." },
  race: { title: "Ta course", lead: "La distance et la date. Sans course, on entretient ta forme." },
  target: { title: "Ton chrono visé", lead: "Facultatif. Sans chrono, l'objectif est de finir." },
  runs: { title: "Combien de courses par semaine ?", lead: "Tu pourras changer ça à tout moment." },
  bedtime: {
    title: "Tu te couches vers quelle heure ?",
    lead: "Pour ne jamais placer une course trop près du coucher.",
  },
  limits: { title: "Tes limites", lead: "Des valeurs proposées, à ajuster si besoin." },
  strength: { title: "Ta muscu", lead: "Facultatif. Ajoute tes séances habituelles, ou fais-le plus tard." },
  pain: { title: "Une douleur en ce moment ?", lead: "Ton plan démarre en douceur si quelque chose te gêne." },
  consents: { title: "Tes données", lead: "Ce que Talaria lit sur ta Garmin. Tu peux changer d'avis dans Programme." },
  timetable: { title: "Ton emploi du temps", lead: "Darius l'a peut-être déjà mis." },
  notifications: {
    title: "Les notifications",
    lead: "Ta semaine prête le dimanche soir, et une course déplacée quand un cours change. Rien d'autre.",
  },
  summary: { title: "C'est prêt", lead: "Vérifie, puis lance ton plan." },
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
  hours: string;
  minutes: string;
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
};

/** Defaults of algo.md section 4.2 (the server's `defaultProfile`). */
export const EMPTY: Draft = {
  otherKm: "",
  date: "",
  hours: "",
  minutes: "",
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
};

/** "Autre": the plan follows the closest of the four distances the coach knows. */
export function distanceOf(draft: Draft): DistanceM | undefined {
  if (typeof draft.race === "number") return draft.race;
  const km = Number(draft.otherKm.replace(",", "."));
  if (draft.race !== "other" || !(km > 0 && km <= 100)) return undefined;
  const closest = (a: DistanceM, b: DistanceM) => (Math.abs(b / 1000 - km) < Math.abs(a / 1000 - km) ? b : a);
  return DISTANCES.map((d) => d.value).reduce<DistanceM>(closest, 5000);
}

/** Target in minutes; undefined when empty, NaN when it does not read as a time. */
export function targetOf(draft: Draft): number | undefined {
  if (!draft.hours && !draft.minutes) return undefined;
  const h = Number(draft.hours || 0);
  const m = Number(draft.minutes || 0);
  const ok = Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h < 10 && m >= 0 && m < 60 && h * 60 + m > 0;
  return ok ? h * 60 + m : Number.NaN;
}

export function feasibilityInput(draft: Draft): FeasibilityInput | undefined {
  const distanceM = distanceOf(draft);
  const targetMin = targetOf(draft);
  if (!distanceM || !draft.date || targetMin === undefined || Number.isNaN(targetMin)) return undefined;
  return { distanceM, date: draft.date, targetMin };
}

function raceIssue(draft: Draft, today: string): string | undefined {
  if (draft.race === "none") return undefined;
  if (draft.race === undefined) return "Choisis ta distance, ou juste entretenir ta forme.";
  if (!distanceOf(draft)) return "Indique la distance en km.";
  if (!draft.date || draft.date <= today) return "Choisis la date de ta course.";
  return undefined;
}

function limitsIssue(draft: Draft): string | undefined {
  if (minutesOf(draft.latestEnd) <= minutesOf(draft.earliest)) return "« Pas après » doit venir après « pas avant ».";
  if (7 - draft.noRunDays.length < draft.runsPerWeek) return `Garde au moins ${draft.runsPerWeek} jours pour courir.`;
  return undefined;
}

/** Why "Continuer" is off on this step, or undefined when it can go on. Only the race is mandatory. */
export function issue(step: Step, draft: Draft, today: string): string | undefined {
  if (step === "race") return raceIssue(draft, today);
  if (step === "limits") return limitsIssue(draft);
  if (step === "target" && Number.isNaN(targetOf(draft))) return "Ce chrono ne se lit pas : heures et minutes.";
  if (step === "strength" && draft.strength.some((s) => !s.name.trim())) return "Donne un nom à chaque séance.";
  if (step === "pain" && draft.pain && !draft.zone) return "Dis où tu as mal.";
  return undefined;
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
    draft.race === "none" || !distanceM
      ? null
      : { distanceM, date: draft.date, ...(targetMin && !Number.isNaN(targetMin) ? { targetMin } : {}) };
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
    },
  };
}
