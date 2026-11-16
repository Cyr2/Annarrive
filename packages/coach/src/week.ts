import { addDays, dateOf, daysBetween } from "./dates.ts";
import { paces } from "./fitness.ts";
import { capWeekSpikes, weeklyCaps } from "./guards.ts";
import { maintenanceWeek, postRaceWeek } from "./maintenance.ts";
import { placeWeek } from "./placement.ts";
import { buildWeek, generatePlan } from "./plan.ts";
import type { Activity, CalEvent, Goal, Paces, Session, Settings, Warning } from "./types.ts";

export type WeekRequest = {
  /** Monday of the week to fill. */
  monday: string;
  now: string;
  /** Null means maintenance (M9). */
  goal: Goal;
  /** Day the programme started: the plan is generated as of that day, so its phases do not slide every week. */
  planStart?: string;
  settings: Settings;
  history: Activity[];
  fitness: { vdot: number; provisional?: boolean };
  cal: CalEvent[];
  /** Sessions of the week that stay as they are (manual, frozen, done, missed, past). */
  kept: Session[];
  prev?: Session[];
};

export type WeekPlan = { sessions: Session[]; warnings: Warning[] };

/** Any Monday: maintenance weeks rotate their Q on it (MA3). */
const EPOCH_MONDAY = "2024-01-01";
const LOOKBACK_WEEKS = 8;
const CAP_WEEKS = 4;

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Minutes run in each of the `n` weeks before `monday`, oldest first. */
function pastWeeks(history: Activity[], monday: string, n: number): number[] {
  return [...Array(n).keys()].map((k) => {
    const from = addDays(monday, -7 * (n - k));
    const to = addDays(from, 7);
    return history.filter((a) => dateOf(a.start) >= from && dateOf(a.start) < to).reduce((s, a) => s + a.durMin, 0);
  });
}

/** Longest run of the 30 days before `now`; unknown history leaves G1 and P14 uncapped. */
function longest30d(history: Activity[], now: string): number {
  const recent = history.filter((a) => a.start < now && daysBetween(a.start, now) <= 30).map((a) => a.durMin);
  return recent.length ? Math.max(...recent) : Number.POSITIVE_INFINITY;
}

/** The unplaced sessions the week calls for: plan week (M2), post-race week (P23) or maintenance (M9). */
function content(r: WeekRequest, p: Paces): WeekPlan {
  const goal = r.goal;
  const history8w = pastWeeks(r.history, r.monday, LOOKBACK_WEEKS);
  if (goal && goal.date >= r.monday) {
    const start = r.planStart ?? r.now;
    const profile = { level: "regular" as const, runsPerWeek: r.settings.runsPerWeek };
    const before = r.history.filter((a) => a.start < start);
    const plan = generatePlan(goal, profile, before, r.fitness, start);
    const first = plan.weeks[0];
    // A programme started mid-week fills the rest of that week with its first plan week.
    const week = plan.weeks.find((w) => w.monday === r.monday) ?? (first && r.monday < first.monday ? first : null);
    if (week) {
      const racePace = goal.targetMin ? { racePaceSKm: (goal.targetMin * 60) / (goal.distanceM / 1000) } : {};
      const ctx = { paces: p, distM: goal.distanceM, longest30dMin: longest30d(r.history, r.now), ...racePace };
      return { sessions: buildWeek(week, ctx), warnings: plan.warnings };
    }
  }
  if (goal && daysBetween(goal.date, r.monday) <= 7)
    return { sessions: postRaceWeek(mean(history8w), p), warnings: [] };
  const weekIdx = Math.floor(daysBetween(EPOCH_MONDAY, r.monday) / 7) + 1;
  return { sessions: maintenanceWeek(history8w, r.settings, weekIdx, { paces: p }), warnings: [] };
}

/** Drops one built session per kept session of the same type: what Anna moved replaces its planned twin. */
function withoutKept(built: Session[], kept: Session[]): Session[] {
  const left = kept.map((k) => k.type);
  return built.filter((s) => {
    const i = left.indexOf(s.type);
    if (i < 0) return true;
    left.splice(i, 1);
    return false;
  });
}

/** G1 and G2 to G4 on the new sessions, against the weeks actually run. */
function capped(sessions: Session[], r: WeekRequest): Session[] {
  const spiked = capWeekSpikes(sessions, longest30d(r.history, r.now)).week;
  const prev = pastWeeks(r.history, r.monday, CAP_WEEKS);
  // Without any run in those weeks there is no reference: the plan's starting volume (P2) already applies.
  if (prev.every((m) => m === 0)) return spiked;
  return weeklyCaps(
    spiked,
    prev.map((minutes) => ({ minutes })),
  ).week;
}

/**
 * Cycle 0.1 `buildWeek`: sizes the week (M2 or M9), caps it (G1 to G4), then places it (M4) around the kept
 * sessions, only after `now`. Unplaceable sessions are left out with the A4 warning.
 */
export function planWeek(r: WeekRequest): WeekPlan {
  const { sessions, warnings } = content(r, paces(r.fitness.vdot));
  const used = new Set(r.kept.map((k) => k.id));
  let n = 0;
  const nextId = (): string => {
    while (used.has(`${r.monday}-${n}`)) n++;
    used.add(`${r.monday}-${n}`);
    return `${r.monday}-${n}`;
  };
  const built = capped(withoutKept(sessions, r.kept), r).map((s) => ({ ...s, id: nextId() }));
  // The past is one long unavailability, so nothing lands before `now`.
  const past: CalEvent[] =
    r.now > `${r.monday}T00:00`
      ? [{ id: "past", kind: "unavailable", start: `${r.monday}T00:00`, end: r.now, manual: true }]
      : [];
  const fixed = r.kept.map((k) => ({ ...k, frozen: true }));
  const placement = placeWeek([...fixed, ...built], [...r.cal, ...past], r.settings, r.monday, r.prev);
  const builtIds = new Set(built.map((b) => b.id));
  const placed = placement.week.sessions.filter((s) => builtIds.has(s.id) && s.start !== "");
  return { sessions: [...r.kept, ...placed], warnings: [...warnings, ...placement.warnings] };
}
