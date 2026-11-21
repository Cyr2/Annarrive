import { buildSession, isHard, raceReminder, toEasy } from "./catalog.ts";
import { addDays, at, dateOf, daysBetween, weekDates } from "./dates.ts";
import { adaptForHealth, MODERATE_DAYS, sickDays } from "./events.ts";
import { paces, predictTime } from "./fitness.ts";
import { capWeekSpikes, enforceDistribution, resumeWeek, weeklyCaps } from "./guards.ts";
import { lastRace, maintenanceWeek, postRaceIndex, postRaceWeek, recoveryRestDays } from "./maintenance.ts";
import { nearRace, placeWeek } from "./placement.ts";
import {
  buildWeek,
  generatePlan,
  type Plan,
  type PlanWeek,
  type TemplateSlot,
  taperShares,
  training,
  weekTemplate,
} from "./plan.ts";
import { fatigueDays } from "./readiness.ts";
import type {
  Activity,
  CalEvent,
  DailySignal,
  FeelLog,
  Goal,
  GoalDistance,
  Health,
  Paces,
  Phase,
  Session,
  Settings,
  Warning,
} from "./types.ts";

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
  /** `measuredOn`: day the level in service was set (accepted or estimated), for P26. */
  fitness: { vdot: number; provisional?: boolean; measuredOn?: string };
  cal: CalEvent[];
  /** Sessions of the week that stay as they are (manual, frozen, done, missed, past). */
  kept: Session[];
  /** Sessions of the week before, so each run keeps its day and hour (S9). */
  prev?: Session[];
  /** Health status at the build: a week built while returning from a fever is a return week (EV9, G7). */
  health?: Health;
  /** Morning signals of the last weeks and her feels: confirmed fatigue last week makes this week a deload (P9). */
  signals?: DailySignal[];
  feels?: FeelLog[];
};

export type WeekPlan = { sessions: Session[]; warnings: Warning[] };

/** Any Monday: maintenance weeks rotate their Q on it (MA3). */
const EPOCH_MONDAY = "2024-01-01";
const LOOKBACK_WEEKS = 8;
/** P9: three days of confirmed fatigue in the week before make the next one a deload. */
const FATIGUE_DAYS = 3;
/** F10: programme weeks 2 to 4 (index 1 to 3) carry a test while the level is provisional. */
const TEST_WEEKS: [number, number] = [1, 3];
/** P26: research 02 R23 re-estimates the level at each race or test, or every 4 weeks. */
const RETEST_DAYS = 28;

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Minutes run in each of the `n` weeks before `monday`, oldest first. */
function pastWeeks(history: Activity[], monday: string, n: number): number[] {
  return [...Array(n).keys()].map((k) => {
    const from = addDays(monday, -7 * (n - k));
    const to = addDays(from, 7);
    return history.filter((a) => dateOf(a.start) >= from && dateOf(a.start) < to).reduce((s, a) => s + a.durMin, 0);
  });
}

/** Longest training run of the 30 days before `now`; unknown history leaves G1 and P14 uncapped. */
function longest30d(history: Activity[], now: string): number {
  const recent = training(history)
    .filter((a) => a.start < now && daysBetween(a.start, now) <= 30)
    .map((a) => a.durMin);
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

/** P9: days of last week whose body signals were confirmed. Fever days are illness, not fatigue (B1, EV9). */
function tiredLastWeek(r: WeekRequest): number {
  if (!r.signals) return 0;
  const sick = r.health ? sickDays(r.health, dateOf(r.now)) : [];
  const days = weekDates(addDays(r.monday, -7)).filter((d) => !sick.includes(d));
  return fatigueDays(r.signals, { lastFeels: r.feels ?? [], cal: r.cal, sick, settings: r.settings }, days).length;
}

/** P9: a deload week, volume × 0.75, Q fractions × 2/3 and L × 0.75 (buildWeek). Taper and deload weeks stay. */
const deloaded = (w: PlanWeek): PlanWeek =>
  w.deload || w.phase === "taper" ? w : { ...w, deload: true, volumeMin: 0.75 * w.volumeMin };

/** F10: the week's first quality slot (sprints or fartlek in base) becomes the test. */
function withTest(w: PlanWeek): PlanWeek {
  const easy: TemplateSlot[] = ["L", "E", "RECUP", "E+strides"];
  const i = w.template.findIndex((slot) => !easy.includes(slot));
  return i < 0 ? w : { ...w, template: w.template.map((slot, k) => (k === i ? "TEST" : slot)) };
}

/** Last time her level was measured: a level change, or a test or race she ran (R23). */
function lastMeasure(r: WeekRequest): string | undefined {
  const runs = r.history
    .filter((a) => a.isTest || a.isRace || a.plannedType === "TEST" || a.plannedType === "RACE")
    .map((a) => dateOf(a.start));
  return [r.fitness.measuredOn, ...runs]
    .filter((d) => d !== undefined)
    .sort()
    .at(-1);
}

/** P26 (research 02 R23): a level that turns 4 weeks old within the week is measured again, by a test, outside the taper. */
function retestDue(w: PlanWeek, r: WeekRequest): boolean {
  const last = lastMeasure(r);
  return w.phase !== "taper" && last !== undefined && daysBetween(last, addDays(r.monday, 6)) >= RETEST_DAYS;
}

/** The plan week to build: P9 on confirmed fatigue, F10's test while the level is provisional, P26's every 4 weeks. */
function adjusted(w: PlanWeek, r: WeekRequest): PlanWeek {
  const tired = tiredLastWeek(r) >= FATIGUE_DAYS ? deloaded(w) : w;
  const provisional = r.fitness.provisional === true;
  const testWeek = provisional ? w.index >= TEST_WEEKS[0] && w.index <= TEST_WEEKS[1] : retestDue(w, r);
  return testWeek ? withTest(tired) : tired;
}

type Content = WeekPlan & { phase: Phase };

/**
 * The unplaced sessions the week calls for: post-race weeks (P23, MA6), before a new plan too (its base weeks absorb
 * them, research 06 §4.2), else the plan week (M2) or maintenance (M9).
 */
function content(r: WeekRequest, p: Paces): Content {
  const goal = r.goal;
  const history8w = pastWeeks(r.history, r.monday, LOOKBACK_WEEKS);
  const race = lastRace(goal, r.history, r.monday);
  const afterRace = race && postRaceIndex(race, r.monday);
  if (race && afterRace) {
    // The weeks up to race day: the reference stays put from one easy week to the next.
    const usual = mean(pastWeeks(r.history, addDays(race.day, 1), LOOKBACK_WEEKS));
    return { sessions: postRaceWeek(usual, p, race.distM, afterRace), warnings: [], phase: "base" };
  }
  if (goal && goal.date >= r.monday) {
    const plan = programPlan({ ...r, goal });
    const first = plan.weeks[0];
    // A programme started mid-week fills the rest of that week with its first plan week.
    const found =
      plan.weeks.find((w) => w.monday === r.monday) ??
      (first && r.monday < first.monday ? first : raceWeek(plan, r.monday, r.settings.runsPerWeek));
    const week = adjusted(found, r);
    const racePace = goal.targetMin ? { racePaceSKm: targetPace(goal.targetMin, goal.distanceM, p) } : {};
    const ctx = { paces: p, distM: goal.distanceM, longest30dMin: longest30d(r.history, r.now), ...racePace };
    return { sessions: buildWeek(week, ctx), warnings: plan.warnings, phase: week.phase };
  }
  const weekIdx = Math.floor(daysBetween(EPOCH_MONDAY, r.monday) / 7) + 1;
  return { sessions: maintenanceWeek(history8w, r.settings, weekIdx, { paces: p }), warnings: [], phase: "dev" };
}

/**
 * P21: the race-pace blocks aim at her target; from the half up, never faster than her T pace of the week, the
 * pace she holds about an hour (Daniels): a half run faster than that is a race, not a session.
 */
function targetPace(targetMin: number, distM: GoalDistance, p: Paces): number {
  const pace = (targetMin * 60) / (distM / 1000);
  return distM >= HALF_M ? Math.max(pace, p.T) : pace;
}

const HALF_M = 21097.5;

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
 * length, the lowest priority first, so that placement never drops an easy run for them (A4). The race week keeps
 * one Q only, a short reminder at race pace (P18: Bosquet 2007 keeps intensity, not volume; Pfitzinger).
 */
function fitHardRuns(sessions: Session[], r: WeekRequest, race: Session, raceWeek: boolean, p: Paces): Session[] {
  const raceDay = dateOf(race.start);
  const days = weekDates(r.monday).filter((d) => d >= dateOf(r.now) && !nearRace(d, raceDay)).length;
  const room = new Set(
    sessions
      .filter(isHard)
      .sort((a, b) => a.priority - b.priority)
      .slice(0, raceWeek ? 1 : Math.ceil(days / 2)),
  );
  const pace = race.steps[0]?.target.paceSKm?.[0] ?? p.M;
  return sessions.map((s) => {
    if (!isHard(s)) return s;
    if (!room.has(s)) return toEasy(s, s.durMin);
    return raceWeek ? { ...raceReminder(p, pace), id: s.id, priority: s.priority } : s;
  });
}

/** A race still planned on another day than the goal's belongs to the old goal: it goes with it. */
const staleRace = (s: Session, r: WeekRequest): boolean =>
  s.type === "RACE" && s.status === "planned" && s.start >= r.now && dateOf(s.start) !== r.goal?.date;

/**
 * Drops one built session per kept session: what Anna moved replaces its planned twin, of the same type and steps
 * if there is one. After a new goal the
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
  // The exact twin first: a kept footing with sprints drops the planned one, not the one with strides (P12).
  const shape = (s: Session): string => `${s.type}:${s.steps.map((st) => st.kind).join()}`;
  const unmatched = kept
    .filter((k) => !drop((s) => shape(s) === shape(k)))
    .filter((k) => !drop((s) => s.type === k.type));
  const spare = (s: Session): boolean => s.type !== "L" && s.type !== "RACE";
  for (const k of unmatched) if (!drop((s) => spare(s) && isHard(s) === isHard(k))) drop(spare);
  return left;
}

/** Days without a run before `monday`, counted from the last run before it. */
function daysOff(history: Activity[], monday: string): number {
  const last = history
    .map((a) => a.start)
    .filter((s) => dateOf(s) < monday)
    .sort()
    .at(-1);
  return last ? daysBetween(last, monday) : 0;
}

/**
 * Research 03 §9.1: after a fever, the return follows the table of breaks (§8.3) by its length, at least the 3 to 6
 * days row (85 %): a week built while she is sick or recovering is a return week (G7).
 */
function returning(sessions: Session[], r: WeekRequest): Session[] {
  const h = r.health;
  const back = h?.kind === "sick" || (h?.kind === "recovering" && r.monday < addDays(h.easyUntil, MODERATE_DAYS));
  return back ? resumeWeek(sessions, Math.max(3, daysOff(r.history, r.monday))).week : sessions;
}

/** EV10, EV13: a session built during a cold, or in the 3 days after it, is already the one she may run. */
const whileUnwell = (s: Session, r: WeekRequest, p: Paces): Session =>
  r.health?.kind === "cold" || r.health?.kind === "easy" ? adaptForHealth(s, r.health, dateOf(s.start), p) : s;

/** MA6: the days off right after the race (goal or last goal race) that fall in or before the week, as unavailable. */
function restAfterRace(r: WeekRequest): CalEvent[] {
  const race = lastRace(r.goal, r.history, addDays(r.monday, 7));
  if (!race) return [];
  const end = addDays(race.day, 1 + recoveryRestDays(race.distM));
  return end > r.monday
    ? [
        {
          id: "race-rest",
          kind: "unavailable",
          start: `${addDays(race.day, 1)}T00:00`,
          end: `${end}T00:00`,
          manual: true,
        },
      ]
    : [];
}

/** G1 and G2 to G4 on the new sessions against the weeks actually run, then P16 on what is left. */
function capped(sessions: Session[], r: WeekRequest, phase: Phase): Session[] {
  const spiked = capWeekSpikes(sessions, longest30d(r.history, r.now)).week;
  const prev = pastWeeks(r.history, r.monday, LOOKBACK_WEEKS);
  // Without any run in those weeks there is no reference: the plan's starting volume (P2) already applies.
  if (prev.every((m) => m === 0)) return spiked;
  const sized = weeklyCaps(
    returning(spiked, r),
    prev.map((minutes) => ({ minutes })),
  ).week;
  return enforceDistribution(sized, phase).week;
}

/**
 * Cycle 0.1 `buildWeek`: sizes the week (M2 or M9), caps it (G1 to G4), then places it (M4) around the kept
 * sessions, only after `now`. Unplaceable sessions are left out with the A4 warning.
 */
export function planWeek(r: WeekRequest): WeekPlan {
  const p = paces(r.fitness.vdot);
  const { sessions, warnings, phase } = content(r, p);
  const kept = r.kept.filter((k) => !staleRace(k, r));
  const used = new Set(kept.map((k) => k.id));
  let n = 0;
  const nextId = (): string => {
    while (used.has(`${r.monday}-${n}`)) n++;
    used.add(`${r.monday}-${n}`);
    return `${r.monday}-${n}`;
  };
  // The past is one long unavailability, so nothing lands before `now`. P25: nor today, whatever rebuilt the week.
  const pastEnd = `${addDays(dateOf(r.now), 1)}T00:00`;
  const past: CalEvent[] =
    pastEnd > `${r.monday}T00:00`
      ? [{ id: "past", kind: "unavailable", start: `${r.monday}T00:00`, end: pastEnd, manual: true }]
      : [];
  const cal = [...r.cal, ...past, ...restAfterRace(r)];
  const race = raceSession(r, p);
  const raceThisWeek = race !== null && dateOf(race.start) < addDays(r.monday, 7);
  // P24: the race replaces the week's long run, and is never capped like a planned rise.
  const left = withoutKept(race && raceThisWeek ? [...sessions.filter((s) => s.type !== "L"), race] : sessions, kept);
  const runs = left.filter((s) => s.type !== "RACE");
  const sized = capped(race ? fitHardRuns(runs, r, race, raceThisWeek, p) : runs, r, phase);
  const built = [...sized, ...left.filter((s) => s.type === "RACE")];
  const withIds = built.map((s) => ({ ...s, id: nextId() }));
  const fixed = kept.map((k) => ({ ...k, frozen: true }));
  // A race early next week still bars this week's last days to hard runs (H12).
  const nextWeekRace = race && !raceThisWeek ? [{ ...race, id: "next-week-race" }] : [];
  const placement = placeWeek([...fixed, ...nextWeekRace, ...withIds], cal, r.settings, r.monday, r.prev);
  const builtIds = new Set(withIds.map((b) => b.id));
  const placed = placement.week.sessions.filter((s) => builtIds.has(s.id) && s.start !== "");
  return {
    sessions: [...kept, ...placed.map((s) => whileUnwell(s, r, p))],
    warnings: [...warnings, ...placement.warnings],
  };
}
