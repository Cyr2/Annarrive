import { buildSession, isHard, toEasy } from "./catalog.ts";
import { addDays, at, dateOf, daysBetween, weekDates } from "./dates.ts";
import { paces, predictTime } from "./fitness.ts";
import { capWeekSpikes, weeklyCaps } from "./guards.ts";
import { maintenanceWeek, postRaceWeek } from "./maintenance.ts";
import { nearRace, placeWeek } from "./placement.ts";
import { buildWeek, generatePlan, type Plan, type PlanWeek, taperShares, weekTemplate } from "./plan.ts";
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

/** The programme `planWeek` follows: generated as of its start day, from the runs before it. */
export function programPlan(
  r: Pick<WeekRequest, "now" | "planStart" | "settings" | "history" | "fitness"> & { goal: NonNullable<Goal> },
): Plan {
  const start = r.planStart ?? r.now;
  const profile = { level: "regular" as const, runsPerWeek: r.settings.runsPerWeek };
  return generatePlan(
    r.goal,
    profile,
    r.history.filter((a) => a.start < start),
    r.fitness,
    start,
  );
}

/** The unplaced sessions the week calls for: plan week (M2), post-race week (P23) or maintenance (M9). */
function content(r: WeekRequest, p: Paces): WeekPlan {
  const goal = r.goal;
  const history8w = pastWeeks(r.history, r.monday, LOOKBACK_WEEKS);
  if (goal && goal.date >= r.monday) {
    const plan = programPlan({ ...r, goal });
    const first = plan.weeks[0];
    // A programme started mid-week fills the rest of that week with its first plan week.
    const week =
      plan.weeks.find((w) => w.monday === r.monday) ??
      (first && r.monday < first.monday ? first : raceWeek(plan, r.monday, r.settings.runsPerWeek));
    const racePace = goal.targetMin ? { racePaceSKm: (goal.targetMin * 60) / (goal.distanceM / 1000) } : {};
    const ctx = { paces: p, distM: goal.distanceM, longest30dMin: longest30d(r.history, r.now), ...racePace };
    return { sessions: buildWeek(week, ctx), warnings: plan.warnings };
  }
  if (goal && daysBetween(goal.date, r.monday) <= 7)
    return { sessions: postRaceWeek(mean(history8w), p), warnings: [] };
  const weekIdx = Math.floor(daysBetween(EPOCH_MONDAY, r.monday) / 7) + 1;
  return { sessions: maintenanceWeek(history8w, r.settings, weekIdx, { paces: p }), warnings: [] };
}

/** P24: a race less than a full week away has no plan week; it gets the taper template at the race-week share (P18). */
function raceWeek(plan: Plan, monday: string, runsPerWeek: Settings["runsPerWeek"]): PlanWeek {
  const d = plan.goal.distanceM;
  const share = taperShares(d, plan.weeks.length).at(-1) ?? 0.5;
  const template = weekTemplate("taper", runsPerWeek, d, 0);
  return {
    index: 0,
    monday,
    phase: "taper",
    volumeMin: share * plan.vPeak,
    deload: false,
    progressionStep: 0,
    template,
  };
}

/** Days after Monday within which the race still bars the week's hard runs (H12 starts three days before it). */
const RACE_REACH_DAYS = 9;

/** A road race in France most often starts in the morning: the race's hour until she gives it (P24). */
export const RACE_START = "09:00";

/**
 * P24: the race on its date and at its start time, set by the organiser: neither her calendar nor a day
 * without runs moves it. Null when the race is too far away to touch the week.
 */
function raceSession(r: WeekRequest, p: Paces): Session | null {
  const goal = r.goal;
  if (!goal || goal.date < r.monday || daysBetween(r.monday, goal.date) > RACE_REACH_DAYS) return null;
  const min = goal.targetMin ?? predictTime(r.fitness.vdot, goal.distanceM);
  const s = buildSession("RACE", {
    weeklyMin: 0,
    paces: p,
    phase: "taper",
    progressionStep: 0,
    distM: goal.distanceM,
    racePaceSKm: (min * 60) / (goal.distanceM / 1000),
  });
  return { ...s, start: at(goal.date, goal.startTime ?? RACE_START), frozen: true };
}

/**
 * H12 leaves fewer days for hard runs: those beyond one every other free day become easy runs of the same
 * length, the lowest priority first, so that placement never drops an easy run for them (A4).
 */
function fitHardRuns(sessions: Session[], r: WeekRequest, raceDay: string): Session[] {
  const days = weekDates(r.monday).filter((d) => d >= dateOf(r.now) && !nearRace(d, raceDay)).length;
  const room = new Set(
    sessions
      .filter(isHard)
      .sort((a, b) => a.priority - b.priority)
      .slice(0, Math.ceil(days / 2)),
  );
  return sessions.map((s) => (isHard(s) && !room.has(s) ? toEasy(s, s.durMin) : s));
}

/** A race still planned on another day than the goal's belongs to the old goal: it goes with it. */
const staleRace = (s: Session, r: WeekRequest): boolean =>
  s.type === "RACE" && s.status === "planned" && s.start >= r.now && dateOf(s.start) !== r.goal?.date;

/**
 * Drops one built session per kept session: what Anna moved replaces its planned twin. After a new goal the
 * week may have no twin of that type: it then replaces one as hard, else any, never the long run nor the
 * race, so the week keeps its number of runs.
 */
function withoutKept(built: Session[], kept: Session[]): Session[] {
  const left = [...built];
  const drop = (match: (s: Session) => boolean): boolean => {
    const i = left.findIndex(match);
    if (i >= 0) left.splice(i, 1);
    return i >= 0;
  };
  const unmatched = kept.filter((k) => !drop((s) => s.type === k.type));
  const spare = (s: Session): boolean => s.type !== "L" && s.type !== "RACE";
  for (const k of unmatched) if (!drop((s) => spare(s) && isHard(s) === isHard(k))) drop(spare);
  return left;
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
  const p = paces(r.fitness.vdot);
  const { sessions, warnings } = content(r, p);
  const kept = r.kept.filter((k) => !staleRace(k, r));
  const used = new Set(kept.map((k) => k.id));
  let n = 0;
  const nextId = (): string => {
    while (used.has(`${r.monday}-${n}`)) n++;
    used.add(`${r.monday}-${n}`);
    return `${r.monday}-${n}`;
  };
  // The past is one long unavailability, so nothing lands before `now`. P25: nor on the day the programme starts.
  const startsToday = r.planStart === dateOf(r.now);
  const pastEnd = startsToday ? `${addDays(dateOf(r.now), 1)}T00:00` : r.now;
  const past: CalEvent[] =
    pastEnd > `${r.monday}T00:00`
      ? [{ id: "past", kind: "unavailable", start: `${r.monday}T00:00`, end: pastEnd, manual: true }]
      : [];
  const cal = [...r.cal, ...past];
  const race = raceSession(r, p);
  const raceThisWeek = race !== null && dateOf(race.start) < addDays(r.monday, 7);
  // P24: the race replaces the week's long run, and is never capped like a planned rise.
  const left = withoutKept(race && raceThisWeek ? [...sessions.filter((s) => s.type !== "L"), race] : sessions, kept);
  const sized = capped(
    left.filter((s) => s.type !== "RACE"),
    r,
  );
  const built = [
    ...(race ? fitHardRuns(sized, r, dateOf(race.start)) : sized),
    ...left.filter((s) => s.type === "RACE"),
  ];
  const withIds = built.map((s) => ({ ...s, id: nextId() }));
  const fixed = kept.map((k) => ({ ...k, frozen: true }));
  // A race early next week still bars this week's last days to hard runs (H12).
  const nextWeekRace = race && !raceThisWeek ? [{ ...race, id: "next-week-race" }] : [];
  const placement = placeWeek([...fixed, ...nextWeekRace, ...withIds], cal, r.settings, r.monday, r.prev);
  const builtIds = new Set(withIds.map((b) => b.id));
  const placed = placement.week.sessions.filter((s) => builtIds.has(s.id) && s.start !== "");
  return { sessions: [...kept, ...placed], warnings: [...warnings, ...placement.warnings] };
}
