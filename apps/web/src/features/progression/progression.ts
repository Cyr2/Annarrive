import type { Progression } from "@annarrive/protocol";
import { daysBetween, duration, longDate } from "../../lib/date.ts";
import { clock } from "../program/program.ts";

export type Data = NonNullable<Progression>;

const RACES: Record<Data["distanceM"], string> = { 5000: "5 km", 10000: "10 km", 21097.5: "Semi", 42195: "Marathon" };

/** « Semi », « 10 km »: the race the estimate is for. */
export const raceName = (d: Data): string => RACES[d.distanceM];

/** A race time to the second: « 1:53:30 », « 24:06 ». */
export const fullTime = (min: number): string => clock(Math.round(min * 60));

/** A race time as a headline: « 1:51 » over an hour (to the minute), « 24:06 » under. */
export function shortTime(min: number): string {
  if (min < 60) return fullTime(min);
  const total = Math.round(min);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** The week `today` falls in, 0-based; -1 before the plan. */
export const currentWeek = (d: Data, today: string): number => d.weeks.findLastIndex((w) => w.monday <= today);

/** « 1 h 48 sur 2 h 54 cette semaine ». */
export function weekLine(d: Data, today: string): string {
  const w = d.weeks[currentWeek(d, today)];
  return w ? `${duration(Math.round(w.doneMin))} sur ${duration(Math.round(w.plannedMin))} cette semaine` : "";
}

/** « 14 séances tenues sur 15 », then « depuis le début du programme »: two short lines, the same height at any width. */
export function keptLine(d: Data): { figure: string; rest: string } {
  const { kept, total } = d.kept;
  if (total === 0) return { figure: "Pas encore de séance passée", rest: "Celles que tu tiens se comptent ici" };
  const plural = kept > 1;
  return {
    figure: `${kept} ${plural ? "séances tenues" : "séance tenue"} sur ${total}`,
    rest: "depuis le début du programme",
  };
}

/** One point of the curve, in the chart's 0..1 box: x along the plan's weeks, y up for a faster time. */
export type Point = { x: number; y: number; min: number };

export type Trajectory = {
  /** The end of each week done, then today, oldest first. */
  points: Point[];
  /** Where the dotted line ends: her target on race day. */
  target?: Point;
};

/** PR1 drawn: one point per week begun, today's where today is; fewer than two points draw nothing. */
export function trajectory(d: Data, today: string): Trajectory | null {
  const now = currentWeek(d, today);
  const n = d.weeks.length;
  const points = d.weeks.flatMap((w, i) => {
    if (w.estimateMin === undefined || i > now) return [];
    const x = i < now ? i + 1 : i + Math.min(7, daysBetween(w.monday, today) + 1) / 7;
    return [{ x: x / n, min: w.estimateMin }];
  });
  if (points.length < 2) return null;
  const times = [...points.map((p) => p.min), ...(d.targetMin ? [d.targetMin] : [])];
  const [lo, hi] = [Math.min(...times), Math.max(...times)];
  // A flat curve still needs a height: one minute either side.
  const pad = Math.max((hi - lo) * 0.15, 1);
  const y = (min: number) => 1 - (min - (lo - pad)) / (hi - lo + 2 * pad);
  return {
    points: points.map((p) => ({ ...p, y: y(p.min) })),
    ...(d.targetMin ? { target: { x: 1, y: y(d.targetMin), min: d.targetMin } } : {}),
  };
}

/** Bars of PR2, in the 0..1 height of the tallest week. */
export function bars(d: Data) {
  const top = Math.max(1, ...d.weeks.map((w) => Math.max(w.plannedMin, w.doneMin)));
  return d.weeks.map((w) => ({ monday: w.monday, planned: w.plannedMin / top, done: w.doneMin / top }));
}

/** What VoiceOver reads for the curve and the bars, week by week. */
export function summary(d: Data, today: string): string {
  const now = currentWeek(d, today);
  const race = raceName(d);
  const estimates = d.weeks
    .flatMap((w, i) => (w.estimateMin && i <= now ? [`semaine ${i + 1}, ${fullTime(w.estimateMin)}`] : []))
    .join(" ; ");
  const runs = d.weeks
    .slice(0, now + 1)
    .map((w, i) => `semaine ${i + 1}, ${duration(Math.round(w.doneMin))} sur ${duration(Math.round(w.plannedMin))}`)
    .join(" ; ");
  return `${race} estimé : ${estimates}. Temps couru sur temps prévu : ${runs}.`;
}

/** The sheet's rows: each week begun, newest first, « Semaine 4 » and « 1:51:00 ». */
export function weekRows(d: Data, today: string) {
  const now = currentWeek(d, today);
  return d.weeks
    .flatMap((w, i) =>
      w.estimateMin && i <= now ? [{ label: `Semaine ${i + 1}`, value: fullTime(w.estimateMin) }] : [],
    )
    .reverse();
}

/** « Départ », or « Jeudi 12 novembre ». */
export function changeLabel(change: Data["changes"][number]): string {
  if (change.start) return "Départ";
  const date = longDate(change.date);
  return date.charAt(0).toUpperCase() + date.slice(1);
}

/** « 14 mars »: the race day under the curve's end. */
export const raceDay = (d: Data): string => longDate(d.raceDate).replace(/^\S+ /, "");
