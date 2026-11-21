import { isHard, toEasy } from "./catalog.ts";
import {
  addDays,
  addMin,
  clockMin,
  DAY_MIN,
  DAY_NAMES,
  dateOf,
  daysBetween,
  hoursBetween,
  mondayOf,
  toIso,
  toMin,
  weekDates,
  weekday,
} from "./dates.ts";
import type {
  CalEvent,
  Change,
  MoveProposal,
  Session,
  Settings,
  Slot,
  SlotWithReason,
  UsualHours,
  Violation,
  Warning,
  WeekState,
} from "./types.ts";

const AFTER_EVENT_MIN = 30;
const GRID_MIN = 30;
const FREEZE_H = 12;
const H4_RELAXED_PTS = 100;
const EXTRA_MOVE_GAIN = 50;

export const slotAt = (s: Session, start: string): Slot => ({ start, end: addMin(start, s.durMin) });
export const slotOf = (s: Session): Slot => slotAt(s, s.start);
const isRun = (s: Session): boolean => s.start !== "" && (s.status === "planned" || s.status === "done");
const runsBut = (w: WeekState, id: string): Session[] => w.sessions.filter((s) => s.id !== id && isRun(s));
const dayStart = (iso: string): number => toMin(dateOf(iso));
/** A bedtime before noon is after midnight. */
const bedMin = (s: Settings): number => clockMin(s.bedtime) + (clockMin(s.bedtime) < 720 ? DAY_MIN : 0);
/** Only a session she marked as legs counts: a missing flag is not a legs day (owner decision, 17/11/2026). */
const isLegs = (e: CalEvent): boolean => e.kind === "strength" && e.legs === true;
export const isFrozen = (s: Session, now: string): boolean => s.frozen || hoursBetween(now, s.start) < FREEZE_H;
const v = (ruleId: string, message: string): Violation => ({ ruleId, message });

// ---------- Hard constraints ----------

function h1(slot: Slot, cal: CalEvent[], s: Settings): Violation | null {
  const [a, b] = [toMin(slot.start), toMin(slot.end)];
  const hit = cal.some((e) => a < toMin(e.end) + AFTER_EVENT_MIN && b > toMin(e.start) - s.travelMin);
  return hit ? v("H1", "Pris par un cours ou un créneau occupé") : null;
}

function h2(slot: Slot, s: Settings): Violation | null {
  if (s.noRunDays.includes(weekday(slot.start))) return v("H2", "Jour sans course");
  const start = toMin(slot.start) - dayStart(slot.start);
  const end = toMin(slot.end) - dayStart(slot.start);
  if (start < clockMin(s.earliest) || end > clockMin(s.latestEnd)) return v("H2", "En dehors de tes horaires");
  return null;
}

const h3 = (slot: Slot, runs: Session[]): Violation | null =>
  runs.some((r) => dateOf(r.start) === dateOf(slot.start)) ? v("H3", "Déjà une course ce jour-là") : null;

const h4 = (slot: Slot, runs: Session[]): Violation | null =>
  runs.some((r) => isHard(r) && Math.abs(daysBetween(r.start, slot.start)) === 1)
    ? v("H4", "Deux séances dures d'affilée")
    : null;

function h5(slot: Slot, cal: CalEvent[]): Violation | null {
  const start = toMin(slot.start);
  const legs = cal.find((e) => isLegs(e) && toMin(e.end) <= start && start - toMin(e.end) < (e.light ? 12 : 24) * 60);
  if (!legs) return null;
  return v("H5", `Moins de ${legs.light ? 12 : 24} h après ta séance jambes`);
}

function h6(slot: Slot, cal: CalEvent[]): Violation | null {
  const end = toMin(slot.end);
  const sameDay = cal.some(
    (e) =>
      isLegs(e) &&
      dateOf(e.start) === dateOf(slot.start) &&
      toMin(e.start) >= toMin(slot.start) &&
      toMin(e.start) - end < 60,
  );
  return sameDay ? v("H6", "Moins d'1 h entre ta course et ta séance jambes") : null;
}

const h7 = (slot: Slot, s: Settings): Violation | null =>
  toMin(slot.end) > dayStart(slot.start) + bedMin(s) - 60 ? v("H7", "Moins d'1 h avant ton coucher") : null;

/** H12: from three days before the race (last Q at J-4, P18) to the end of the week after it (P23). */
export const nearRace = (day: string, raceDay: string): boolean =>
  daysBetween(day, raceDay) <= 3 && daysBetween(raceDay, day) <= 6;

const h12 = (slot: Slot, runs: Session[]): Violation | null =>
  runs.some((r) => r.type === "RACE" && nearRace(slot.start, r.start)) ? v("H12", "Trop près du jour J") : null;

/** H13: Christmas Eve and Day, New Year's Eve and Day, as « MM-DD ». */
const HOLIDAYS = ["12-24", "12-25", "12-31", "01-01"];

/** H13: no quality session and no test on a holiday; a long run or a footing may stay. */
const h13 = (session: Session, slot: Slot): Violation | null =>
  session.type !== "L" && session.type !== "RACE" && HOLIDAYS.includes(dateOf(slot.start).slice(5))
    ? v("H13", "Jour de fête")
    : null;

/** H1 to H7, H12 and H13 for `session` at `slot`; [] means valid. H8 holds by construction (a session is one block). */
export function checkHard(session: Session, slot: Slot, week: WeekState): Violation[] {
  const runs = runsBut(week, session.id);
  const s = week.settings;
  const hard = isHard(session);
  return [
    h1(slot, week.cal, s),
    h2(slot, s),
    h3(slot, runs),
    hard ? h4(slot, runs) : null,
    hard ? h5(slot, week.cal) : null,
    hard ? h6(slot, week.cal) : null,
    h7(slot, s),
    hard ? h12(slot, runs) : null,
    hard ? h13(session, slot) : null,
  ].filter((x) => x !== null);
}

// ---------- Slots ----------

function grid(day: string, s: Settings, durMin: number): Slot[] {
  const slots: Slot[] = [];
  const base = `${day}T00:00`;
  for (let t = clockMin(s.earliest); t + durMin <= clockMin(s.latestEnd); t += GRID_MIN) {
    slots.push({ start: addMin(base, t), end: addMin(base, t + durMin) });
  }
  return slots;
}

/** Calendar-free slots of a day on a 30 min grid (H1, H2, H7). */
export const freeSlots = (day: string, cal: CalEvent[], s: Settings, durMin: number): Slot[] =>
  grid(day, s, durMin).filter((slot) => !h1(slot, cal, s) && !h2(slot, s) && !h7(slot, s));

// ---------- Soft constraints ----------

type Item = { id: string; pts: number };

function legsPenalties(hard: boolean, slot: Slot, cal: CalEvent[]): Item[] {
  const start = toMin(slot.start);
  const end = toMin(slot.end);
  const items: Item[] = [];
  for (const e of cal.filter(isLegs)) {
    const gapH = (start - toMin(e.end)) / 60;
    if (hard && gapH >= 24 && gapH < 48) items.push({ id: "S2", pts: (40 * (48 - gapH)) / 24 });
    if (!hard && gapH >= 0 && gapH < 6) items.push({ id: "S3", pts: 15 });
    const after = (toMin(e.start) - end) / 60;
    if (hard && dateOf(e.start) === dateOf(slot.start) && after >= 0 && after < 6) items.push({ id: "S4", pts: 10 });
  }
  return items;
}

function examPenalties(hard: boolean, lateEvening: boolean, slot: Slot, cal: CalEvent[]): Item[] {
  const exams = cal.filter((e) => e.kind === "exam");
  const items: Item[] = [];
  if (hard && lateEvening && exams.some((e) => daysBetween(slot.start, e.start) === 1))
    items.push({ id: "S5", pts: 50 });
  const end = toMin(slot.end);
  if (exams.some((e) => toMin(e.start) - end >= 0 && toMin(e.start) - end < 180)) items.push({ id: "S6", pts: 40 });
  return items;
}

const SATURDAY = 5;
const SUNDAY = 6;

/**
 * S8: off the days she accepts for her long run. Any of them is fine, the freest wins on the other rules, and
 * Sunday breaks a tie (1 point elsewhere). Without a choice: Sunday, the other weekend day at half.
 */
function longDayPenalty(day: number, accepted?: number[]): number {
  if (!accepted?.length) return day === SUNDAY ? 0 : day === SATURDAY ? 10 : 20;
  if (accepted.includes(day)) return day === SUNDAY || accepted.length === 1 ? 0 : 1;
  return 20;
}

const USUAL_RUNS = 10;

/**
 * S7 without a stated hour: the median start of her last 10 runs, on the half-hour grid of the placement. Undefined
 * without any run, and the earliest free slot wins as before.
 */
export function usualHour(runs: { start: string }[]): string | undefined {
  const clocks = runs
    .map((r) => r.start)
    .sort()
    .slice(-USUAL_RUNS)
    .map((start) => toMin(start) - dayStart(start))
    .sort((a, b) => a - b);
  if (clocks.length === 0) return undefined;
  const mid = Math.floor(clocks.length / 2);
  const upper = clocks[mid] ?? 0;
  const median = clocks.length % 2 === 1 ? upper : ((clocks[mid - 1] ?? upper) + upper) / 2;
  return toIso(Math.round(median / GRID_MIN) * GRID_MIN).slice(11, 16);
}

/**
 * S7: her usual hours, each by `usualHour`: weekday runs, weekend runs, and the longest run of each week she ran
 * (her long run, whatever its day).
 */
export function usualHours(runs: { start: string; durMin: number }[]): UsualHours {
  const weekend = (r: { start: string }) => weekday(r.start) >= SATURDAY;
  const longest = new Map<string, { start: string; durMin: number }>();
  for (const r of runs) {
    const monday = mondayOf(r.start);
    if ((longest.get(monday)?.durMin ?? -1) < r.durMin) longest.set(monday, r);
  }
  const hours: UsualHours = {
    weekday: usualHour(runs.filter((r) => !weekend(r))),
    weekend: usualHour(runs.filter(weekend)),
    long: usualHour([...longest.values()]),
  };
  return Object.fromEntries(Object.entries(hours).filter(([, h]) => h !== undefined));
}

/** S7: the stated hour, else her long-run hour for a long run, else her hour for that kind of day. */
function habitHour(session: Session, slot: Slot, s: Settings): string | undefined {
  if (s.preferredHour !== undefined) return s.preferredHour;
  const u = s.usualHours;
  if (!u) return undefined;
  if (session.type === "L" && u.long) return u.long;
  return weekday(slot.start) >= SATURDAY ? (u.weekend ?? u.weekday) : (u.weekday ?? u.weekend);
}

function habitPenalties(session: Session, slot: Slot, week: WeekState): Item[] {
  const s = week.settings;
  const items: Item[] = [];
  const hour = habitHour(session, slot, s);
  if (hour !== undefined) {
    const offH = Math.abs(toMin(slot.start) - dayStart(slot.start) - clockMin(hour)) / 60;
    if (offH > 0) items.push({ id: "S7", pts: Math.min(20, 5 * offH) });
  }
  if (session.type === "L") {
    const pts = longDayPenalty(weekday(slot.start), s.preferredLongDays);
    if (pts > 0) items.push({ id: "S8", pts });
  }
  const last = week.prev?.find((p) => p.type === session.type && p.start !== "");
  const clockDiff = (a: string, b: string): number => Math.abs(toMin(a) - dayStart(a) - (toMin(b) - dayStart(b)));
  if (last && (weekday(last.start) !== weekday(slot.start) || clockDiff(last.start, slot.start) > 120)) {
    items.push({ id: "S9", pts: 5 });
  }
  return items;
}

function spreadPenalties(hard: boolean, slot: Slot, week: WeekState, runs: Session[]): Item[] {
  const items: Item[] = [];
  const day = dateOf(slot.start);
  // The Sunday before and the Monday after count as run days, so an empty end of week is a gap too.
  const days = [
    ...new Set([addDays(week.monday, -1), ...runs.map((r) => dateOf(r.start)), day, addDays(week.monday, 7)]),
  ].sort();
  const longGap = days.some((d, i) => i > 0 && daysBetween(days[i - 1] ?? d, d) > 3);
  if (week.settings.runsPerWeek >= 3 && longGap) items.push({ id: "S10", pts: 10 });
  // Per neighbouring run: a run between two others costs twice, so the week spreads instead of bunching.
  const neighbours = runs.filter((r) => Math.abs(daysBetween(r.start, day)) === 1).length;
  if (neighbours > 0) items.push({ id: "S13", pts: 5 * neighbours });
  const start = toMin(slot.start);
  const otherStrength = week.cal.filter((e) => e.kind === "strength" && e.legs === false);
  if (hard && otherStrength.some((e) => start - toMin(e.end) >= 0 && start - toMin(e.end) < 180)) {
    items.push({ id: "S11", pts: 5 });
  }
  const close = runs.some(
    (r) => isHard(r) && Math.abs(daysBetween(r.start, slot.start)) > 1 && Math.abs(toMin(r.start) - start) < 48 * 60,
  );
  if (hard && close) items.push({ id: "S12", pts: 10 });
  return items;
}

/** S1 to S12. */
export function softPenalty(session: Session, slot: Slot, week: WeekState): { total: number; items: Item[] } {
  const hard = isHard(session);
  const lateEvening = toMin(slot.end) > dayStart(slot.start) + bedMin(week.settings) - 240;
  const items = [
    ...(hard && lateEvening ? [{ id: "S1", pts: 30 }] : []),
    ...legsPenalties(hard, slot, week.cal),
    ...examPenalties(hard, lateEvening, slot, week.cal),
    ...habitPenalties(session, slot, week),
    ...spreadPenalties(hard, slot, week, runsBut(week, session.id)),
  ];
  return { total: items.reduce((sum, i) => sum + i.pts, 0), items };
}

// ---------- Weekly placement ----------

type Candidate = { slot: Slot; pts: number };

/** Cost of `session` at `slot`, or null if a hard rule breaks. A4a turns H4 into 100 points. */
function cost(session: Session, slot: Slot, week: WeekState, relaxH4: boolean): number | null {
  const hard = checkHard(session, slot, week);
  const blocking = hard.filter((x) => !(relaxH4 && x.ruleId === "H4"));
  if (blocking.length > 0) return null;
  return softPenalty(session, slot, week).total + H4_RELAXED_PTS * (hard.length - blocking.length);
}

/** Best slot of each day (lowest cost, then earliest), sorted. Other slots of a day never change feasibility. */
function dayCandidates(session: Session, week: WeekState, relaxH4: boolean): Candidate[] {
  const out: Candidate[] = [];
  for (const day of weekDates(week.monday)) {
    let best: Candidate | null = null;
    for (const slot of grid(day, week.settings, session.durMin)) {
      const pts = cost(session, slot, week, relaxH4);
      if (pts !== null && (best === null || pts < best.pts)) best = { slot, pts };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => a.pts - b.pts || a.slot.start.localeCompare(b.slot.start));
}

/** A1, A2: depth-first search with branch and bound; the first solution among equals wins, so the result is stable. */
function search(order: Session[], week: WeekState, relaxH4: boolean): Session[] | null {
  const found: { cost: number; placed: Session[] }[] = [];
  const visit = (i: number, placed: Session[], total: number): void => {
    const best = found[0];
    if (best && total >= best.cost) return;
    const s = order[i];
    if (!s) {
      found[0] = { cost: total, placed };
      return;
    }
    const w = { ...week, sessions: [...week.sessions, ...placed] };
    for (const c of dayCandidates(s, w, relaxH4))
      visit(i + 1, [...placed, { ...s, start: c.slot.start }], total + c.pts);
  };
  visit(0, [], 0);
  return found[0]?.placed ?? null;
}

const isFixed = (s: Session): boolean => s.start !== "" && (s.manual || s.frozen || s.status === "done");
const byPriority = (a: Session, b: Session): number => a.priority - b.priority || a.id.localeCompare(b.id);
const lowestEasy = (xs: Session[]): Session | undefined =>
  xs
    .filter((s) => s.type === "E")
    .sort(byPriority)
    .at(-1);
const lowestQ = (xs: Session[]): Session | undefined =>
  xs
    .filter((s) => isHard(s) && s.type !== "L")
    .sort(byPriority)
    .at(-1);

const RELAXATIONS: { id: string; message: string; apply: (todo: Session[]) => Session[] | null }[] = [
  { id: "A4a", message: "Deux séances dures se suivent cette semaine, il manquait de la place", apply: (t) => t },
  {
    id: "A4b",
    message: "Un footing raccourci pour que tout tienne",
    apply: (t) => {
      const e = lowestEasy(t);
      return e ? t.map((s) => (s === e ? toEasy(s, Math.floor(s.durMin * 0.7)) : s)) : null;
    },
  },
  {
    id: "A4c",
    message: "Un footing en moins cette semaine pour que tout tienne",
    apply: (t) => {
      const e = lowestEasy(t);
      return e ? t.filter((s) => s !== e) : null;
    },
  },
  {
    id: "A4d",
    message: "Une séance rapide devient un footing tranquille pour que tout tienne",
    apply: (t) => {
      const q = lowestQ(t);
      return q ? t.map((s) => (s === q ? toEasy(s, s.durMin) : s)) : null;
    },
  },
];

export type Placement = { week: WeekState; relaxations: string[]; warnings: Warning[] };

/** A1 to A4. `monday` is required because unplaced sessions carry no date. */
export function placeWeek(
  sessions: Session[],
  cal: CalEvent[],
  s: Settings,
  monday: string,
  prev?: Session[],
): Placement {
  const fixed = sessions.filter(isFixed);
  const base: WeekState = { monday, sessions: fixed, cal, settings: s, ...(prev ? { prev } : {}) };
  let todo = sessions.filter((x) => !isFixed(x)).sort(byPriority);
  let placed = search(todo, base, false);
  const relaxations: string[] = [];
  const warnings: Warning[] = [];
  for (const r of RELAXATIONS) {
    if (placed) break;
    todo = r.apply(todo) ?? todo;
    relaxations.push(r.id);
    warnings.push({ ruleId: r.id, message: r.message });
    placed = search(todo, base, true);
  }
  if (!placed) warnings.push({ ruleId: "A4", message: "Une course n'a pas trouvé de place cette semaine" });
  return { week: { ...base, sessions: [...fixed, ...(placed ?? todo)] }, relaxations, warnings };
}

// ---------- Replanning ----------

export type Disruption = { moved: number; dayChanges: number; shiftH: number; penalty: number };

/** A2 (2) and (3): fewer moves first, unless the extra move saves at least 50 points. */
export function betterSolution(a: Disruption, b: Disruption): boolean {
  if (a.moved !== b.moved) {
    const [more, fewer] = a.moved > b.moved ? [a, b] : [b, a];
    const extraWins = fewer.penalty - more.penalty >= EXTRA_MOVE_GAIN;
    return (a === more) === extraWins;
  }
  if (a.dayChanges !== b.dayChanges) return a.dayChanges < b.dayChanges;
  if (a.shiftH !== b.shiftH) return a.shiftH < b.shiftH;
  return a.penalty < b.penalty;
}

/**
 * A3 for one session: the least disruptive valid slot after `now`.
 * shortcut: swapping with another run is not tried; add it if same-day and other-day moves often fail.
 */
function bestMove(s: Session, rest: WeekState, now: string): Slot | null {
  let best: { slot: Slot; d: Disruption } | null = null;
  // P25: a repair never brings a run from another day onto today; she would find a run she did not plan.
  const days = weekDates(rest.monday).filter((day) => day !== dateOf(now) || day === dateOf(s.start));
  for (const day of days) {
    for (const slot of grid(day, rest.settings, s.durMin)) {
      if (slot.start <= now || checkHard(s, slot, rest).length > 0) continue;
      const d: Disruption = {
        moved: 1,
        dayChanges: dateOf(slot.start) === dateOf(s.start) ? 0 : 1,
        shiftH: Math.abs(hoursBetween(s.start, slot.start)),
        penalty: softPenalty(s, slot, rest).total,
      };
      if (!best || betterSolution(d, best.d)) best = { slot, d };
    }
  }
  return best?.slot ?? null;
}

export type Replan = { week: WeekState; proposals: MoveProposal[]; changes: Change[]; warnings: Warning[] };

const withSession = (w: WeekState, s: Session): WeekState => ({
  ...w,
  sessions: w.sessions.map((x) => (x.id === s.id ? s : x)),
});

/** Repairs one conflicting movable session: move, else Q → E in place, else skip (A4). */
function repair(s: Session, rest: WeekState, now: string, ruleId: string): Change {
  const slot = bestMove(s, rest, now);
  if (slot) return { ruleId, sessionId: s.id, before: s, after: { ...s, start: slot.start } };
  const easy = toEasy(s, s.durMin);
  if (isHard(s) && checkHard(easy, slotOf(easy), rest).length === 0)
    return { ruleId: "A4d", sessionId: s.id, before: s, after: easy };
  return { ruleId: "A4c", sessionId: s.id, before: s, after: { ...s, status: "skipped" } };
}

/**
 * Minimal repair after a real event (§0.1). Manual and done sessions stay and only warn (H10);
 * sessions starting within 12 h are proposed, never moved (H9).
 */
export function replan(week: WeekState, trigger: string, now: string, own = false): Replan {
  const out: Replan = { week, proposals: [], changes: [], warnings: [] };
  const ordered = week.sessions.filter(isRun).sort((a, b) => a.start.localeCompare(b.start));
  for (const { id } of ordered) out.week = replanOne(id, out, trigger, now, own);
  return out;
}

/** `own`: Anna's own action caused the conflict (an event she added), so H9 does not hold the session back. */
function replanOne(id: string, out: Replan, trigger: string, now: string, own: boolean): WeekState {
  const w = out.week;
  const s = w.sessions.find((x) => x.id === id);
  if (!s || !isRun(s) || (s.status === "planned" && s.start < now)) return w;
  const violations = checkHard(s, slotOf(s), w);
  if (violations.length === 0) return w;
  if (s.manual || s.status === "done") {
    out.warnings.push(...violations.map((x) => ({ ...x, sessionId: id })));
    return w;
  }
  if (!own && isFrozen(s, now)) {
    out.proposals.push({ sessionId: id, slots: proposeMoveSlots(id, w, now).best });
    return w;
  }
  const repaired = repair(s, { ...w, sessions: w.sessions.filter((x) => x.id !== id) }, now, trigger);
  // The rule it broke where it was: the banner says why it moved.
  const change = { ...repaired, detail: violations[0]?.message ?? "" };
  out.changes.push(change);
  return change.after ? withSession(w, change.after) : w;
}

export type MoveSlots = {
  best: SlotWithReason[];
  forbidden: { slot: Slot; reason: string }[];
  /** When nothing fits this week (PL-11). */
  fallback?: ["jog_tonight", "skip"];
};

/** A6. Valid slots never force another run to move (checkHard looks at both sides), so no side effects. */
export function proposeMoveSlots(sessionId: string, week: WeekState, now: string): MoveSlots {
  const s = week.sessions.find((x) => x.id === sessionId);
  if (!s) throw new Error(`Unknown session ${sessionId}`);
  const forbidden: MoveSlots["forbidden"] = [];
  const byCost = (a: Candidate, b: Candidate): number => a.pts - b.pts || a.slot.start.localeCompare(b.slot.start);
  const perDay = weekDates(week.monday)
    .flatMap((day) => bestOfDay(s, day, week, now, forbidden))
    .sort(byCost);
  const top = perDay.slice(0, 3);
  // A6: the day after is the move she asks for most, so its best slot is always offered when allowed.
  const nextDay = perDay.find((c) => dateOf(c.slot.start) === addDays(dateOf(s.start), 1));
  if (nextDay && !top.includes(nextDay)) top[2] = nextDay;
  // A6: a morning when one is free, so an evening habit never hides it (audit parcours réel, G1).
  const morning = weekDates(week.monday)
    .flatMap((day) => bestOfDay(s, day, week, now, [], isMorning))
    .sort(byCost)[0];
  if (morning && !top.some((c) => isMorning(c.slot))) {
    if (top.length < 3) top.push(morning);
    else top[top[2] === nextDay ? 1 : 2] = morning;
  }
  const best = top
    .sort(byCost)
    .map((c): SlotWithReason => ({ slot: c.slot, penalty: c.pts, reason: slotReason(s, c.slot, week) }));
  return best.length > 0 ? { best, forbidden } : { best, forbidden, fallback: ["jog_tonight", "skip"] };
}

/** AD3: the best valid future slot of the session's own week, on `from` or after, by soft cost; null when none. */
export function bestSlotFrom(s: Session, week: WeekState, now: string, from: string): Slot | null {
  const ignored: MoveSlots["forbidden"] = [];
  const best = weekDates(mondayOf(s.start))
    .filter((day) => day >= from)
    .flatMap((day) => bestOfDay(s, day, week, now, ignored))
    .sort((a, b) => a.pts - b.pts || a.slot.start.localeCompare(b.slot.start))[0];
  return best?.slot ?? null;
}

const NOON_MIN = 12 * 60;
const isMorning = (slot: Slot): boolean => toMin(slot.start) - dayStart(slot.start) < NOON_MIN;

/** Best valid future slot of a day; forbidden ones are collected with their first violation. */
function bestOfDay(
  s: Session,
  day: string,
  week: WeekState,
  now: string,
  forbidden: MoveSlots["forbidden"],
  keep: (slot: Slot) => boolean = () => true,
): Candidate[] {
  let best: Candidate | null = null;
  for (const slot of grid(day, week.settings, s.durMin)) {
    if (slot.start <= now || slot.start === s.start || !keep(slot)) continue;
    const first = checkHard(s, slot, week)[0];
    if (first) {
      forbidden.push({ slot, reason: first.message });
      continue;
    }
    const pts = softPenalty(s, slot, week).total;
    if (!best || pts < best.pts) best = { slot, pts };
  }
  return best ? [best] : [];
}

// ---------- Reasons (A6) ----------

/** What a slot costs her, said plainly: the dominant soft penalty. */
const SOFT_REASONS: Record<string, string> = {
  S1: "tard avant ton coucher",
  S2: "près de ta muscu jambes",
  S3: "juste après ta muscu jambes",
  S4: "juste avant ta muscu jambes",
  S5: "la veille d'un examen",
  S6: "peu avant un examen",
  S7: "loin de ton heure habituelle",
  S8: "pas ton jour de sortie longue",
  S9: "pas son jour habituel",
  S10: "laisse plus de 2 jours sans courir",
  S11: "peu après ta muscu",
  S12: "proche d'une autre séance dure",
  S13: "la veille ou le lendemain d'une autre course",
};

const dayPart = (iso: string): string => {
  const min = toMin(iso) - dayStart(iso);
  return min < 12 * 60 ? "matin" : min < 18 * 60 ? "après-midi" : "soir";
};

/** "1 h 30", "45 min". */
function gapText(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** A6: a short reason for a proposed slot, never empty: same day, its cost, the legs session, then her classes. */
export function slotReason(s: Session, slot: Slot, week: WeekState): string {
  const shift = toMin(slot.start) - toMin(s.start);
  if (dateOf(slot.start) === dateOf(s.start))
    return `même jour, ${gapText(Math.abs(shift))} plus ${shift > 0 ? "tard" : "tôt"}`;
  // Only what this slot costs more than where the session is now is the slot's doing.
  const now = new Set(softPenalty(s, slotOf(s), week).items.map((i) => i.id));
  const worst = softPenalty(s, slot, week)
    .items.filter((i) => !now.has(i.id))
    .sort((a, b) => b.pts - a.pts)[0];
  const cost = worst && SOFT_REASONS[worst.id];
  if (cost) return cost;
  const start = toMin(slot.start);
  const legs = week.cal
    .filter((e) => isLegs(e) && Math.abs(toMin(e.start) - start) < 3 * DAY_MIN)
    .sort((a, b) => Math.abs(toMin(a.start) - start) - Math.abs(toMin(b.start) - start))[0];
  if (legs && isHard(s))
    return `ta muscu jambes est ${DAY_NAMES[weekday(legs.start)]} ${dayPart(legs.start)}, l'écart est bon`;
  const sameDay = week.cal
    .filter((e) => e.kind === "class" || e.kind === "exam")
    .filter((e) => dateOf(e.start) === dateOf(slot.start));
  if (sameDay.some((e) => toMin(e.start) >= toMin(slot.end))) return "avant tes cours";
  if (sameDay.length > 0) return "après tes cours";
  return "journée sans cours";
}
