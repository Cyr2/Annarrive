import { isoWeek } from "../../lib/date.ts";
import type { Activity, Item, RaceResult, Run, WeekReview } from "../schemas.ts";
import { isRun } from "./rules.ts";
import { easyRun } from "./seed.ts";

/** `?mock=bilan`: the review she closed, kept for the tab like the server keeps it, so a reload finds it closed. */
const DISMISSED = "annarrive.mock.review";

export function reviewDismissed(week: string): boolean {
  try {
    return sessionStorage.getItem(DISMISSED) === week;
  } catch {
    return false;
  }
}

export function dismissReview(week: string): void {
  try {
    sessionStorage.setItem(DISMISSED, week);
  } catch {
    // Without storage the review closes until the next reload.
  }
}

/** Sunday evening of the seeded week: every run done, Monday's intervals faster than planned. */
export function mockReview(monday: string, items: Item[], next: Item[]): WeekReview {
  const runs = items.filter(isRun);
  return {
    week: isoWeek(monday),
    monday,
    done: runs.length,
    planned: runs.length,
    minutes: runs.reduce((sum, r) => sum + r.durationMin, 0),
    highlight: { text: "Ton fractionné de lundi, plus rapide que prévu", intensity: "hard" },
    reggie: "Tu as fait toutes tes courses. La semaine prochaine garde le même volume.",
    next: next.filter(isRun),
  };
}

/** `?mock=course`: the half-marathon of the mockup, 28 s under her target and 4 min 28 better than in December. */
export const RACE: Omit<RaceResult, "date"> = {
  race: "Semi-marathon",
  distanceKm: 21.0975,
  timeMin: 107 + 32 / 60,
  gapMin: -28 / 60,
  previous: { timeMin: 112, date: "2025-12-07" },
  splits: [
    { toKm: 5, paceSKm: 311 },
    { toKm: 10, paceSKm: 306 },
    { toKm: 15, paceSKm: 305 },
    { toKm: 20, paceSKm: 303 },
    { toKm: 21.1, paceSKm: 298 },
  ],
  reggie:
    "Plus rapide sur la deuxième moitié que sur la première. Ta fin a été ta portion la plus rapide. Bravo Anna. Repose-toi bien cette semaine.",
  recovery: "deux semaines de footings faciles",
};

export const RACE_ACTIVITY: Activity = {
  id: "a-race",
  title: "Jour J fait",
  receivedAt: "11:04",
  distanceKm: 21.2,
  duration: "1:47:32",
  mainPaceLabel: "Allure moyenne",
  mainPace: "5'04 /km",
  verdict: "Prévu 1 h 48, fait en 1 h 47",
  askFeel: false,
  intensity: "hard",
};

/** `?mock=bilan`: Sunday's long run, synced that morning. */
export const LONG_ACTIVITY: Activity = {
  id: "a-long",
  title: "Sortie longue faite",
  receivedAt: "10:32",
  distanceKm: 12.4,
  duration: "1:21:05",
  mainPaceLabel: "Allure moyenne",
  mainPace: "6'32 /km",
  verdict: "Prévu 1 h 20, fait en 1 h 21",
  askFeel: false,
  intensity: "long",
};

/** « Garder la forme »: next week's runs become easy footings, the first of the easy weeks (algo.md MA6). */
export function recoveryWeek(items: Item[]): Item[] {
  return items.map((item) => {
    if (!isRun(item)) return item;
    const run: Run = { ...item, ...easyRun(item.start, Math.min(40, item.durationMin)) };
    return { ...run, distanceKm: undefined, mainSet: undefined };
  });
}

/** The race took Sunday's slot: the long run of the seed is gone that day. */
export const withoutRunOn = (items: Item[], date: string): Item[] =>
  items.filter((i) => !(isRun(i) && i.date === date));
