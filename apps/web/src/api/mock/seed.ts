import { addDays, addMinutes } from "../../lib/date.ts";
import type { CalendarEvent, Item, Program, Run, Strength } from "../schemas.ts";

/** A plausible week matching the mockups (design/Main, Semaine): Monday is index 0. */

type RunSeed = Omit<Run, "id" | "date" | "watch" | "kind">;
type EventSeed = Omit<CalendarEvent, "id" | "date">;

export const INTERVALS: RunSeed = {
  start: "18:00",
  durationMin: 50,
  title: "Fractionné",
  intensity: "hard",
  distanceKm: 8,
  mainSet: "6 × 800 m",
  pace: "4'55 /km",
  steps: [
    { label: "Échauffement · 15 min", pace: "6'30 /km", tone: "plain", minutes: 15 },
    {
      repeat: 6,
      steps: [
        { label: "800 m", pace: "4'55 /km", tone: "hard", minutes: 4 },
        { label: "Récupérer · 2 min", pace: "6'30 /km", tone: "muted", minutes: 2 },
      ],
    },
    { label: "Retour au calme · 10 min", pace: "6'30 /km", tone: "plain", minutes: 10 },
  ],
  why: "Des fractions un peu plus rapides que ton allure semi, pour que 5'07 /km te paraisse confortable le jour J.",
};

export const easyRun = (start: string, durationMin: number, title = "Footing facile"): RunSeed => ({
  start,
  durationMin,
  title,
  intensity: "easy",
  pace: "6'30 /km",
  steps: [{ label: `${durationMin} min`, pace: "6'30 /km", tone: "plain", minutes: durationMin }],
  why: "Des kilomètres faciles : ils construisent ton endurance sans te fatiguer.",
});

const LONG: RunSeed = {
  start: "9:00",
  durationMin: 80,
  title: "Sortie longue",
  intensity: "long",
  distanceKm: 12,
  pace: "6'30 /km",
  steps: [
    { label: "1 h 10", minutes: 70, pace: "6'30 /km", tone: "plain" },
    { label: "10 min", minutes: 10, pace: "5'07 /km", tone: "hard" },
  ],
  why: "La séance clé de la semaine : elle habitue ton corps à durer.",
};

const STRIDES: RunSeed = {
  ...easyRun("17:30", 40, "Footing et accélérations"),
  steps: [
    { label: "30 min", minutes: 30, pace: "6'30 /km", tone: "plain" },
    { repeat: 6, steps: [{ label: "Accélération · 20 s", pace: "4'25 /km", tone: "hard" }] },
  ],
};

const cls = (title: string, start: string, end: string): EventSeed => ({ kind: "class", title, start, end });
const rev = (start: string, end: string): EventSeed => ({ kind: "revision", title: "Révision", start, end });

const WEEK: (RunSeed | EventSeed)[][] = [
  [cls("Physique", "10:15", "12:15"), rev("14:00", "16:00"), INTERVALS],
  [cls("(M1M2E G3 NL) UE1 Français", "8:15", "10:15"), cls("(M1M2E G3 NL) UE4 Allemand", "12:45", "14:45")],
  [easyRun("7:30", 45), rev("16:00", "18:00")],
  [cls("UE3 Mathématiques", "8:15", "10:15")],
  [STRIDES],
  [rev("10:00", "12:00")],
  [LONG],
];

export const STRENGTH: Strength[] = [
  {
    id: "s-upper",
    name: "Haut du corps",
    legs: false,
    weekday: 0,
    start: "20:00",
    durationMin: 60,
    repeat: "weekly",
    placed: true,
  },
  {
    id: "s-legs",
    name: "Jambes",
    legs: true,
    weekday: 3,
    start: "19:30",
    durationMin: 60,
    repeat: "weekly",
    placed: true,
  },
  {
    id: "s-full",
    name: "Haut et bas du corps",
    legs: true,
    weekday: 5,
    start: "11:00",
    durationMin: 60,
    repeat: "never",
    placed: false,
  },
];

export function strengthEvent(template: Strength, monday: string): CalendarEvent {
  const date = addDays(monday, template.weekday);
  return {
    id: `${template.id}-${date}`,
    kind: "strength",
    date,
    start: template.start,
    end: addMinutes(template.start, template.durationMin),
    title: template.name,
    legs: template.legs,
    templateId: template.id,
  };
}

export function seedWeek(monday: string, strength: Strength[]): Item[] {
  const items: Item[] = WEEK.flatMap((day, index) =>
    day.map((seed, n): Item => {
      const date = addDays(monday, index);
      const id = `${date}-${n}`;
      return "kind" in seed ? { ...seed, id, date } : { ...seed, id, date, kind: "run", watch: "synced" };
    }),
  );
  const placed = strength.filter((t) => t.placed && t.repeat !== "never");
  return [...items, ...placed.map((t) => strengthEvent(t, monday))];
}

export function seedProgram(raceDate: string, now: Date): Program {
  return {
    goal: {
      race: "Semi-marathon",
      distanceKm: 21.1,
      date: raceDate,
      targetTime: "1:48:00",
      targetTag: "reachable",
      targetWhy: { currentMin: 110, weeks: 10, gain: 0.018, gainMax: 0.035 },
    },
    phases: [
      { name: "Base", weeks: 4 },
      { name: "Développement", weeks: 3 },
      { name: "Spécifique", weeks: 3 },
      { name: "Affûtage", weeks: 2 },
    ],
    weekIndex: 4,
    weekTotal: 12,
    phaseNote: "Semaine 4 sur 12, fin de la phase de base",
    maintenance: false,
    settings: {
      runsPerWeek: 4,
      noRunDays: [5],
      longRunDays: [6],
      notBefore: "7:00",
      notAfter: "21:00",
      bedtime: "23:00",
      recoveryData: true,
      travelMin: 30,
      usualHour: "18:00",
      notifications: true,
    },
    strength: STRENGTH,
    timetableCheckedAt: new Date(now.getTime() - 12 * 60_000).toISOString(),
    watch: { model: "vivoactive 4", connected: true, lastSync: new Date(now.getTime() - 4 * 60_000).toISOString() },
    garmin: { vo2max: 45, versus: "agrees" },
  };
}
