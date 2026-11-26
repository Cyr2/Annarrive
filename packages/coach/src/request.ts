import { type BuildCtx, buildSession, isHard, MAX_E, scaleSession, toEasy, withReps } from "./catalog.ts";
import { addDays, DAY_NAMES, dateOf, mondayOf, weekDates, weekday } from "./dates.ts";
import { adaptForHealth } from "./events.ts";
import { paces } from "./fitness.ts";
import { trimEasy } from "./guards.ts";
import { maintenanceVolume } from "./maintenance.ts";
import { bestSlotOn, checkHard, slotAt } from "./placement.ts";
import { L_MAX, longRunMin } from "./plan.ts";
import type { Change, Health, Paces, Session, Warning, WeekState } from "./types.ts";
import { pastWeeks, spikeRef, type WeekFrame, type WeekRequest, weekFrame } from "./week.ts";

/** What Anna may ask for (M14): the catalogue's runs, a footing with sprints on the flat as `SPRINTS`. */
export type AskType = "E" | "RECUP" | "SPRINTS" | "L" | "T" | "CRUISE" | "I" | "R" | "SPE" | "FARTLEK";

export type SessionAsk = {
  type: AskType;
  /** Days she accepts, « YYYY-MM-DD »; absent: from tomorrow to Sunday (RQ1). */
  days?: string[];
  durMin?: number;
  /** Fractions, for I, R and CRUISE. */
  reps?: number;
  /** A session id to replace; "add" keeps every run; absent: the day's automatic run, else one more (RQ2). */
  replace?: string;
};

export type RequestInput = Omit<WeekRequest, "monday" | "kept" | "prev"> & { sessions: Session[]; ask: SessionAsk };

export type Accepted = {
  ok: true;
  ask: SessionAsk;
  session: Session;
  /** Every session of the window after the change: the caller records them as one change (RQ11). */
  sessions: Session[];
  changes: Change[];
  /** What the coach adjusted or implied, in one line each, for Reggie to say. */
  notes: Warning[];
};
export type Refused = { ok: false; refusal: Warning; alternative?: Accepted };

type Refusal = Warning & { excessMin?: number };
/** `pts`: the soft cost of its slot (M4), to pick among the days she accepts. */
type Try = (Accepted & { pts: number }) | { ok: false; refusal: Refusal };

/** RQ1: a request lands in this week or the next, the window the coach plans. */
const WINDOW_DAYS = 14;
/** RQ8: one run more than her setting, as a one-off. */
const EXTRA_RUNS = 1;
/** RQ5: bounds of a requested easy run (catalogue E and RECUP, P15; G2b's 20 min floor). */
const EASY_BOUNDS: Record<"E" | "RECUP" | "SPRINTS", [number, number]> = {
  E: [20, MAX_E],
  RECUP: [20, 40],
  SPRINTS: [30, MAX_E],
};
const MIN_LONG = 30;
/** RQ5: a run more than the plan, without a length asked: the catalogue E floor (P15). */
const EXTRA_MIN = 30;
/** RQ5: without a goal, a long run stays under MA4's 75 min. */
const MAINTENANCE_LONG = 75;
/** RQ7: research 02 §1.2: 0 to 1 quality session a week in base, 2 at most after (P11). */
const MAX_Q = { base: 1, other: 2 };
/** RQ4: research 02 §1.2, §2.2: base keeps Z3 at 0 to 3 % (strides, short sprints) and no race pace. */
const BASE_TYPES = new Set<AskType>(["E", "RECUP", "SPRINTS", "L", "T", "CRUISE", "FARTLEK"]);
const G2_RISE = 1.1;
const SPIKE = 1.1;
const Q_SCALE_MIN = 0.5;

const no = (ruleId: string, message: string, excessMin?: number): { ok: false; refusal: Refusal } => ({
  ok: false,
  refusal: { ruleId, message, ...(excessMin === undefined ? {} : { excessMin }) },
});

/** « 1 h 20 », « 45 min ». */
function hm(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

const isRun = (s: Session): boolean => s.start !== "" && (s.status === "planned" || s.status === "done");
const inWeek = (monday: string) => (s: Session) =>
  s.start >= `${monday}T00:00` && s.start < `${addDays(monday, 7)}T00:00`;
/** A session the coach may still change on its own: automatic, ahead, not frozen (H9, H10). */
const automatic = (s: Session, now: string): boolean =>
  s.status === "planned" && !s.manual && !s.frozen && s.start > now;
/** P11: a Q, or a long run carrying a race-pace block (one of the two hard runs, plan.ts atMostTwoHard). */
const countsAsQ = (s: Session): boolean =>
  s.type === "L" ? s.steps.some((st) => st.zone === "race") : isHard(s) && s.type !== "RACE";
const isQAsk = (t: AskType): boolean => !["E", "RECUP", "SPRINTS", "L"].includes(t);
const minutes = (xs: Session[]): number => xs.filter(isRun).reduce((sum, s) => sum + s.durMin, 0);

/**
 * RQ1: the days she named, else the replaced session's, else tomorrow to Sunday (next week's from a Sunday). Today
 * only when she names it.
 */
function candidateDays(ask: SessionAsk, now: string, sessions: Session[]): string[] {
  if (ask.days?.length) return ask.days;
  // A named session is replaced on its own day.
  const target = sessions.find((s) => s.id === ask.replace);
  if (target) return [dateOf(target.start)];
  const tomorrow = addDays(dateOf(now), 1);
  return weekDates(mondayOf(tomorrow)).filter((d) => d >= tomorrow);
}

type Frame = { frame: WeekFrame; ctx: BuildCtx; lMax: number; plannedL?: number };

function frameOf(input: RequestInput, monday: string, p: Paces): Frame {
  const frame = weekFrame({ ...input, monday }, p);
  const spike = SPIKE * spikeRef(input.history, input.now);
  if (frame.kind === "plan") {
    const { week, ctx } = frame;
    const runs = Math.min(5, Math.max(3, week.template.length)) as 3 | 4 | 5;
    const base = {
      weeklyMin: week.volumeMin,
      paces: p,
      phase: week.phase,
      progressionStep: week.progressionStep,
      distM: ctx.distM,
      deload: week.deload,
      ...(ctx.racePaceSKm ? { racePaceSKm: ctx.racePaceSKm } : {}),
    };
    const plannedL = longRunMin(runs, week.volumeMin, ctx.distM, ctx.longest30dMin, false, ctx.spikeRefMin);
    return { frame, ctx: base, lMax: Math.min(L_MAX[ctx.distM], spike), plannedL };
  }
  const weeklyMin = frame.kind === "afterRace" ? frame.usualMin : maintenanceVolume(frame.history8w);
  const ctx: BuildCtx = { weeklyMin, paces: p, phase: frame.phase, progressionStep: 0, distM: 10000 };
  return { frame, ctx, lMax: Math.min(MAINTENANCE_LONG, spike) };
}

/** RQ3: health rules on one day. Null: allowed as asked. */
function healthBars(h: Health, day: string, hard: boolean): Refusal | null {
  if (h.kind === "sick") return { ruleId: "EV9", message: "Repos tant que la fièvre dure : je n'ajoute aucune course" };
  if (!hard) return null;
  const why: Partial<Record<Health["kind"], boolean>> = {
    cold: true,
    pain: day <= (h.kind === "pain" ? (h.until ?? h.since) : ""),
    recovering: h.kind === "recovering" && day < h.qEasierUntil,
    easy: h.kind === "easy" && day < h.easyUntil,
  };
  if (!why[h.kind]) return null;
  const words: Partial<Record<Health["kind"], string>> = {
    cold: "pendant un rhume",
    pain: "tant que tu as mal",
  };
  return {
    ruleId: "RQ3",
    message: `Pas de séance rapide ${words[h.kind] ?? "pendant ta reprise"} : un footing tranquille oui`,
  };
}

/** RQ4: what the phase of the week allows. */
function phaseBars(f: WeekFrame, type: AskType, goal: boolean): Refusal | null {
  const hard = type === "L" || isQAsk(type);
  if (f.kind === "afterRace" && hard)
    return { ruleId: "MA6", message: "Semaine de récupération après ta course : des footings seulement" };
  if (f.kind === "plan" && f.phase === "taper" && hard)
    return { ruleId: "P18", message: "Affûtage avant le jour J : les séances rapides du plan suffisent" };
  if (type === "SPE" && !goal)
    return { ruleId: "RQ4", message: "Sans objectif, il n'y a pas d'allure de course à travailler" };
  if (f.phase === "base" && f.kind === "plan" && !BASE_TYPES.has(type))
    return { ruleId: "RQ4", message: "Phase de base : pas encore de séance aussi rapide, du seuil ou un fartlek oui" };
  return null;
}

type Note = (message: string) => void;
type QType = Exclude<AskType, "E" | "RECUP" | "SPRINTS" | "L">;

/** RQ5: an easy run, `want` minutes within the catalogue's bounds. */
function sizedEasy(type: "E" | "RECUP" | "SPRINTS", fr: Frame, want: number, asked: boolean, note: Note): Session {
  const [lo, hi] = EASY_BOUNDS[type];
  const dur = Math.floor(Math.max(lo, Math.min(hi, fr.lMax, want)));
  if (asked && dur !== Math.floor(want))
    note(dur > want ? `${hm(dur)} au moins pour cette séance` : `${hm(dur)} au plus pour un footing`);
  return type === "SPRINTS"
    ? buildSession("E", { ...fr.ctx, durMin: dur, sprints: true })
    : buildSession(type, { ...fr.ctx, durMin: dur });
}

/** RQ5: a long run, up to 1.10 × her longest of 30 days (G1) and the plan's Lmax (P14). */
function sizedLong(fr: Frame, want: number, note: Note): Session {
  const dur = Math.floor(Math.max(MIN_LONG, Math.min(fr.lMax, want)));
  if (want > fr.lMax)
    note(`${hm(dur)} au plus : 10 % de plus que ta plus longue course du mois, et la limite de ton plan`);
  return buildSession("L", { ...fr.ctx, durMin: dur });
}

/** RQ5: a Q at the catalogue's dose for the week; fewer fractions or a shorter one when she asks, never more. */
function sizedQ(type: QType, ask: SessionAsk, fr: Frame, note: Note): Session {
  const fartlek = type === "FARTLEK";
  const dose = buildSession(type, fartlek ? { ...fr.ctx, durMin: ask.durMin ?? 45 } : fr.ctx);
  // P9: a deload week's Q fractions × 2/3, as buildWeek sizes them.
  const q = fr.frame.kind === "plan" && fr.frame.week.deload ? scaleSession(dose, 2 / 3) : dose;
  const reps = q.steps.find((st) => st.kind === "work")?.reps;
  if (ask.reps !== undefined && reps !== undefined) {
    if (ask.reps > reps) note(`${reps} fractions au plus à ton niveau cette semaine`);
    return withReps(q, Math.min(ask.reps, reps));
  }
  if (fartlek || ask.durMin === undefined) return q;
  if (ask.durMin < q.durMin) return scaleSession(q, Math.max(Q_SCALE_MIN, ask.durMin / q.durMin));
  if (ask.durMin > q.durMin) note(`${hm(q.durMin)} : la dose de cette séance à ton niveau`);
  return q;
}

/** RQ5: the session at her level, then the duration or fractions she asked, within the catalogue's bounds. */
function sized(ask: SessionAsk, fr: Frame, defaultMin: number, notes: Warning[]): Session {
  const note: Note = (message) => notes.push({ ruleId: "RQ5", message });
  const { type } = ask;
  if (type === "E" || type === "RECUP" || type === "SPRINTS")
    return sizedEasy(type, fr, ask.durMin ?? defaultMin, ask.durMin !== undefined, note);
  if (type === "L") return sizedLong(fr, ask.durMin ?? defaultMin, note);
  return sizedQ(type, ask, fr, note);
}

/** RQ2: the run the ask replaces on `day`, null to add one; a refusal when that day's run cannot go. */
function replaced(input: RequestInput, day: string): Session | null | Refusal {
  const { ask, now, sessions } = input;
  if (ask.replace === "add") return null;
  if (ask.replace !== undefined) {
    const s = sessions.find((x) => x.id === ask.replace);
    if (s?.status !== "planned" || s.start <= now || s.frozen || s.type === "RACE")
      return {
        ruleId: "RQ2",
        message: "Cette séance ne change plus : elle est passée, faite, figée ou c'est ton jour J",
      };
    return s;
  }
  const there = sessions.find((s) => isRun(s) && dateOf(s.start) === day);
  if (!there) return null;
  const free = automatic(there, now) && !["L", "RACE", "TEST"].includes(there.type);
  return free ? there : { ruleId: "H3", message: "Déjà une course ce jour-là" };
}

/** RQ7: P11 kept by turning the lowest-priority automatic Q of the week into a footing of the same length. */
function keepTwoHard(week: Session[], fresh: Session, base: boolean, now: string, notes: Warning[], changes: Change[]) {
  const max = base ? MAX_Q.base : MAX_Q.other;
  let out = week;
  if (!countsAsQ(fresh)) return out;
  while (out.filter(isRun).filter(countsAsQ).length > max) {
    const swap = out
      .filter((s) => s.id !== fresh.id && s.type !== "L" && countsAsQ(s) && automatic(s, now))
      .sort((a, b) => b.priority - a.priority || b.start.localeCompare(a.start))[0];
    if (!swap) return null;
    const after = toEasy(swap, swap.durMin);
    out = out.map((s) => (s.id === swap.id ? after : s));
    changes.push({ ruleId: "RQ7", sessionId: swap.id, before: swap, after });
    notes.push({
      ruleId: "RQ7",
      message: `Ta séance rapide de ${DAY_NAMES[weekday(swap.start)]} devient un footing : ${max === 1 ? "une séance dure par semaine en base" : "deux séances dures par semaine au plus"}`,
    });
  }
  return out;
}

/** RQ9: no growth in a taper, deload or post-race week; else G2, 10 % above the best of her last 4 weeks. */
function volumeCap(input: RequestInput, f: WeekFrame, monday: string, before: number): number {
  const steady = f.kind === "afterRace" || (f.kind === "plan" && (f.phase === "taper" || f.week.deload));
  if (steady) return before;
  const back = pastWeeks(input.history, monday, 4);
  const best = Math.max(...back);
  return Math.max(before, G2_RISE * (best > 0 ? best : before));
}

type Target = { old: Session | null; longOf?: Session };

/** RQ2, RQ7: what the ask takes the place of on `day`: a run, the week's long run, or nothing. */
function targetOf(input: RequestInput, day: string, weekRuns: Session[]): Target | Refusal {
  const old = replaced(input, day);
  if (old && "message" in old) return old;
  // RQ7: one long run a week: asking for it elsewhere moves the week's own.
  const longOf = input.ask.type === "L" && !old ? weekRuns.find((s) => s.type === "L") : undefined;
  if (longOf && !automatic(longOf, input.now))
    return { ruleId: "P11", message: "Une seule sortie longue par semaine, et celle-ci est déjà fixée" };
  return longOf ? { old, longOf } : { old };
}

/** RQ3: an easy run while unwell is the one EV9 to EV13 allow. */
function healed(s: Session, input: RequestInput, day: string, p: Paces, notes: Warning[]): Session {
  const health = input.health ?? { kind: "ok" };
  if (isHard(s) || health.kind === "ok") return s;
  const after = adaptForHealth(s, health, day, p);
  if (after.durMin < s.durMin)
    notes.push({ ruleId: "RQ3", message: `${hm(after.durMin)} tranquille tant que ça dure` });
  return after;
}

/** RQ6: the replaced run keeps its hour when every hard rule still holds there, else the day's best slot. */
function slotFor(s: Session, old: Session | null, week: WeekState, now: string, day: string) {
  const keep =
    old !== null &&
    old.start > now &&
    dateOf(old.start) === day &&
    checkHard(s, slotAt(s, old.start), week).length === 0;
  return keep && old ? { slot: slotAt(s, old.start), pts: 0 } : bestSlotOn({ ...s, start: "" }, week, now, day);
}

/** One day: health and phase, what it replaces, sizing, placement, then the week's guards. */
function onDay(input: RequestInput, day: string, p: Paces): Try {
  const { ask, now } = input;
  const monday = mondayOf(day);
  const fr = frameOf(input, monday, p);
  const hard = ask.type === "L" || isQAsk(ask.type);
  const bar =
    healthBars(input.health ?? { kind: "ok" }, day, hard) ?? phaseBars(fr.frame, ask.type, input.goal !== null);
  if (bar) return { ok: false, refusal: bar };
  const weekRuns = input.sessions.filter(inWeek(monday)).filter(isRun);
  const target = targetOf(input, day, weekRuns);
  if ("message" in target) return { ok: false, refusal: target };
  const gone = target.old ?? target.longOf;
  // RQ5: a replaced run keeps its length; a run more is a catalogue footing at its floor (P15).
  const defaultMin = gone?.durMin ?? (ask.type === "L" ? (fr.plannedL ?? EXTRA_MIN) : EXTRA_MIN);
  const notes: Warning[] = [];
  const built = { ...sized(ask, fr, defaultMin, notes), id: gone?.id ?? freshId(input.sessions, monday) };
  const draft = healed(built, input, day, p, notes);
  const rest = input.sessions.filter((s) => s.id !== gone?.id);
  const week: WeekState = { monday, sessions: rest, cal: input.cal, settings: input.settings };
  const pick = slotFor(draft, target.old, week, now, day);
  if (!("slot" in pick)) return no(pick.ruleId, pick.message);
  const session: Session = { ...draft, start: pick.slot.start, manual: true, status: "planned", frozen: false };
  const changes: Change[] = [
    { ruleId: "RQ", sessionId: session.id, ...(gone ? { before: gone } : {}), after: session },
  ];
  if (target.longOf)
    notes.push({
      ruleId: "RQ7",
      message: `Ta sortie longue passe de ${DAY_NAMES[weekday(target.longOf.start)]} à ${DAY_NAMES[weekday(day)]}`,
    });
  const draftWeek = { before: weekRuns, week: [...rest.filter(inWeek(monday)), session], session, gone };
  const guarded = guardWeek(input, fr.frame, monday, draftWeek, notes, changes);
  if (!guarded.ok) return guarded;
  const ids = new Set(guarded.week.map((s) => s.id));
  const others = rest.filter((s) => !ids.has(s.id));
  return { ok: true, ask, session, sessions: [...others, ...guarded.week], changes, notes, pts: pick.pts };
}

type WeekDraft = { before: Session[]; week: Session[]; session: Session; gone: Session | undefined };

/** RQ7 to RQ9 on the week with the new session. */
function guardWeek(
  input: RequestInput,
  f: WeekFrame,
  monday: string,
  d: WeekDraft,
  notes: Warning[],
  changes: Change[],
): { ok: true; week: Session[] } | { ok: false; refusal: Refusal } {
  const kept = keepTwoHard(d.week, d.session, f.phase === "base", input.now, notes, changes);
  if (!kept) return no("P11", "Deux séances dures par semaine au plus, et celles qui restent sont déjà fixées");
  // RQ8: one run more than her setting, as a one-off.
  const runs = kept.filter(isRun).length;
  if (runs > input.settings.runsPerWeek + EXTRA_RUNS)
    return no("RQ8", "Une seule course en plus de tes réglages par semaine");
  if (runs > input.settings.runsPerWeek && !d.gone)
    notes.push({ ruleId: "RQ8", message: "Une course en plus cette semaine, sans changer tes réglages" });
  return withinVolume(input, f, monday, d.before, kept, d.session, notes, changes);
}

/** RQ9: the week stays under its cap, automatic footings ahead shortened first (G2b's order, P15 floors). */
function withinVolume(
  input: RequestInput,
  f: WeekFrame,
  monday: string,
  before: Session[],
  week: Session[],
  fresh: Session,
  notes: Warning[],
  changes: Change[],
): { ok: true; week: Session[] } | { ok: false; refusal: Refusal } {
  const cap = volumeCap(input, f, monday, minutes(before));
  const trimmable = week.filter(
    (s) => s.id !== fresh.id && automatic(s, input.now) && (s.type === "E" || s.type === "RECUP"),
  );
  const fixed = minutes(week) - minutes(trimmable);
  const trimmed = trimEasy(trimmable, cap - fixed, "RQ9");
  const out = week.map((s) => trimmed.week.find((t) => t.id === s.id) ?? s);
  const excess = minutes(out) - cap;
  if (excess > 0.5)
    return no(
      "G2",
      "Ta semaine dépasserait de plus de 10 % ce que tu as couru ces dernières semaines",
      Math.ceil(excess),
    );
  for (const c of trimmed.changes) {
    changes.push(c);
    if (c.before && c.after && c.before.durMin - c.after.durMin >= 1)
      notes.push({
        ruleId: "RQ9",
        message: `Ton footing de ${DAY_NAMES[weekday(c.before.start)]} passe à ${hm(c.after.durMin)} pour garder ta semaine dans ses limites`,
      });
  }
  return { ok: true, week: out };
}

function freshId(sessions: Session[], monday: string): string {
  const used = new Set(sessions.map((s) => s.id));
  let k = 0;
  while (used.has(`${monday}-r${k}`)) k++;
  return `${monday}-r${k}`;
}

/** RQ1 then each day: the accepted day with the lowest soft cost, else the first refusal. */
function evaluate(input: RequestInput): Try {
  const { ask, now } = input;
  const today = dateOf(now);
  const end = addDays(mondayOf(today), WINDOW_DAYS);
  const days = candidateDays(ask, now, input.sessions);
  const out = days.filter((d) => d < today || d >= end);
  if (out.length === days.length)
    return no(
      "RQ1",
      days.some((d) => d < today) ? "Ce jour est passé" : "Je place une séance dans cette semaine ou la suivante",
    );
  const p = paces(input.fitness.vdot);
  const tries = days.filter((d) => !out.includes(d)).map((d) => onDay(input, d, p));
  const accepted = tries.filter((t) => t.ok);
  if (accepted.length === 0) return tries[0] ?? no("RQ1", "Aucun jour possible");
  return (
    accepted.sort((a, b) => a.pts - b.pts || a.session.start.localeCompare(b.session.start))[0] ??
    no("RQ1", "Aucun jour possible")
  );
}

/** RQ10: the closest asks the coach could accept, in order: other days of the week, shorter, another type, easy. */
function alternatives(ask: SessionAsk, r: Refusal, now: string): SessionAsk[] {
  const out: SessionAsk[] = [];
  const today = dateOf(now);
  const first = ask.days?.[0];
  if (first && ask.replace === undefined && !["EV9", "RQ4", "MA6", "P18", "G2"].includes(r.ruleId)) {
    const others = weekDates(mondayOf(first)).filter((d) => d > today && !ask.days?.includes(d));
    if (others.length > 0) out.push({ ...ask, days: others });
  }
  if (r.excessMin !== undefined && !isQAsk(ask.type)) {
    const floor = ask.type === "L" ? MIN_LONG : 20;
    out.push({ ...ask, durMin: Math.max(floor, (ask.durMin ?? 30) - r.excessMin) });
  }
  if (r.ruleId === "RQ4") out.push({ ...ask, type: ask.type === "SPE" ? "T" : "FARTLEK" });
  if (r.ruleId !== "EV9" && r.ruleId !== "RQ2" && ask.type !== "E") {
    const { type: _, durMin: __, reps: ___, ...where } = ask;
    out.push({ ...where, type: "E" });
  }
  return out;
}

/**
 * M14 `requestSession`: a session she asks for, built from the catalogue at her level, placed by M4's hard rules and
 * checked against the week's guards. Accepted: the session and every change it implies, one change for Annuler.
 * Refused: the rule and its reason, with the closest ask the coach accepts when there is one.
 */
export function requestSession(input: RequestInput): Accepted | Refused {
  const first = evaluate(input);
  if (first.ok) return clean(first);
  for (const ask of alternatives(input.ask, first.refusal, input.now)) {
    const alt = evaluate({ ...input, ask });
    if (alt.ok && !unchanged(alt)) return { ok: false, refusal: strip(first.refusal), alternative: clean(alt) };
  }
  return { ok: false, refusal: strip(first.refusal) };
}

/** An alternative that leaves her week as it is (the footing she already has) is no alternative. */
const unchanged = (a: Accepted): boolean =>
  a.changes.every(
    (c) =>
      c.before?.type === c.after?.type && c.before?.durMin === c.after?.durMin && c.before?.start === c.after?.start,
  );

const strip = ({ ruleId, message }: Refusal): Warning => ({ ruleId, message });
const clean = ({ pts: _, ...accepted }: Accepted & { pts: number }): Accepted => accepted;
