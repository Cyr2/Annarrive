import type { Item } from "../../api/schemas.ts";
import { minutesOf } from "../../lib/date.ts";

/** The calendar view shows her day from 7:00 to 22:00, as the mockup (semaine-v2, B). */
export const GRID_FROM = 7 * 60;
export const GRID_TO = 22 * 60;
export const GRID_HOURS = (GRID_TO - GRID_FROM) / 60;

export const lengthOf = (item: Item): number =>
  item.kind === "run" ? item.durationMin : minutesOf(item.end) - minutesOf(item.start);

/** Where a span sits in its column, in hours from 7:00, cut to the grid; null when it is wholly outside. */
export function placeOf(start: string, minutes: number): { top: number; height: number } | null {
  const begin = minutesOf(start);
  const from = Math.max(begin, GRID_FROM);
  const to = Math.min(begin + minutes, GRID_TO);
  return to > from ? { top: (from - GRID_FROM) / 60, height: (to - from) / 60 } : null;
}

export type Lane = { lane: number; lanes: number };

/**
 * Items that overlap stand side by side, as in a calendar: each takes the first lane free at its start, and every
 * item of a group of overlapping ones shares the group's number of lanes.
 */
export function lanesOf(items: Item[]): Map<string, Lane> {
  const sorted = [...items].sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
  const lanes = new Map<string, Lane>();
  let group: { id: string; lane: number }[] = [];
  let ends: number[] = [];
  const close = () => {
    for (const { id, lane } of group) lanes.set(id, { lane, lanes: ends.length });
    group = [];
    ends = [];
  };
  for (const item of sorted) {
    const start = minutesOf(item.start);
    if (ends.length > 0 && ends.every((end) => end <= start)) close();
    const free = ends.findIndex((end) => end <= start);
    const lane = free === -1 ? ends.length : free;
    ends[lane] = start + lengthOf(item);
    group.push({ id: item.id, lane });
  }
  close();
  return lanes;
}
