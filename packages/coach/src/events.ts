import { feelLog } from "./adaptation.ts";
import { downgrade, equivalents, isHard, scaleSession, sessionLoad, toEasy } from "./catalog.ts";
import { addDays, DAY_NAMES, dateOf, daysBetween, weekday } from "./dates.ts";
import { paces } from "./fitness.ts";
import { resumeWeek, type ValidateCtx, validateWeek } from "./guards.ts";
import { checkHard, proposeMoveSlots, replan } from "./placement.ts";
import { evaluateFeels } from "./recalibration.ts";
import type {
  Activity,
  CalEvent,
  Change,
  Feel,
  Health,
  Paces,
  PainSite,
  Result,
  Session,
  Settings,
  Slot,
  State,
  Warning,
} from "./types.ts";

export type Unavailable = (
  | { reason: "no_time" }
  | { reason: "tired" }
  | { reason: "sick"; feverOrChest: boolean }
  | { reason: "pain"; where: PainSite; walking0to10: number }
) & { until?: string };

export type ChangeOption = "shorter" | "easier" | "equivalent" | "jog30";

function find(st: State, id: string): Session {
  const s = st.sessions.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown session ${id}`);
  return s;
}

const put = (st: State, s: Session): State => ({ ...st, sessions: st.sessions.map((x) => (x.id === s.id ? s : x)) });
const putAll = (st: State, xs: Session[]): State => xs.reduce(put, st);
const todayOf = (st: State, now: string): Session | undefined =>
  st.sessions.find((s) => s.status === "planned" && dateOf(s.start) === dateOf(now));
const plannedFrom = (st: State, from: string): Session[] =>
  st.sessions
    .filter((s) => s.status === "planned" && s.start !== "" && dateOf(s.start) >= from)
    .sort((a, b) => a.start.localeCompare(b.start));
const change = (ruleId: string, before: Session, after: Session): Change => ({
  ruleId,
  sessionId: before.id,
  before,
  after,
});

/** Every action ends here: G8 decides `ok`, and the previous state is kept for Undo. */
function finish(
  previous: State,
  state: State,
  changes: Change[],
  warnings: Warning[],
  extra: Partial<Result> = {},
  ctx?: ValidateCtx,
): Result {
  return { ok: validateWeek(state, ctx).ok, state, previous, changes, warnings, ...extra };
}

/** Rules that Anna may force: the run is accepted but adapted (EV1). H6 belongs with H5 (legs on the same day). */
const FORCEABLE = new Set(["H4", "H5", "H6", "H7", "H12"]);

/** EV1: Déplacer. */
export function moveSession(st: State, id: string, slot: Slot, now: string): Result {
  const s = find(st, id);
  const rest = { ...st, sessions: st.sessions.filter((x) => x.id !== id) };
  const violations = checkHard(s, slot, rest);
  const blocking = violations.filter((x) => !FORCEABLE.has(x.ruleId));
  if (blocking.length > 0 || slot.start <= now) {
    const message = blocking[0]?.message ?? "Ce moment est déjà passé";
    return {
      ok: false,
      state: st,
      previous: st,
      changes: [],
      warnings: [{ ruleId: blocking[0]?.ruleId ?? "EV1", message, sessionId: id }],
    };
  }
  const moved: Session = { ...s, start: slot.start, manual: true };
  const after = violations.length > 0 && isHard(s) ? { ...toEasy(moved, s.durMin), manual: true } : moved;
  const warnings = violations.slice(0, 1).map((v) => ({ ...v, sessionId: id }));
  return finish(st, put(st, after), [change("EV1", s, after)], warnings);
}

/** EV2 to EV6: four options, none above the planned load or duration. */
export function changeOptions(
  st: State,
  id: string,
): { shorter: Session; easier: Session; equivalent?: Session; jog30: Session } {
  const s = find(st, id);
  const equivalent = equivalents(s, paces(st.vdot))[0];
  const base = {
    shorter: scaleSession(s, 0.75, 5),
    easier: toEasy(s, s.durMin),
    jog30: toEasy(s, Math.min(30, s.durMin)),
  };
  return equivalent ? { ...base, equivalent } : base;
}

/** Changer: applies one option, marked manual. */
export function applyChange(st: State, id: string, option: ChangeOption, now: string): Result {
  const s = find(st, id);
  const chosen = changeOptions(st, id)[option];
  if (!chosen || s.start < now) {
    return {
      ok: false,
      state: st,
      previous: st,
      changes: [],
      warnings: [{ ruleId: "EV4", message: "Cette option n'est pas possible pour cette séance", sessionId: id }],
    };
  }
  const after = { ...chosen, manual: true };
  return finish(
    st,
    put(st, after),
    [change(`CHANGE_${option}`, s, after)],
    [],
    {},
    { plannedLoads: { [id]: sessionLoad(s) } },
  );
}

/** EV10: half the planned time, rounded down to 5 min, at least 15 min (research 03 §9, "neck check"). */
const coldMin = (durMin: number): number => Math.max(15, Math.floor((0.5 * durMin) / 5) * 5);

/** EV13: a Q becomes an E of the same length; the long run and the race stay. */
const withoutQ = (s: Session): Session => (isHard(s) && s.type !== "L" && s.type !== "RACE" ? toEasy(s, s.durMin) : s);

/**
 * EV9 to EV12: what a session becomes if Anna runs despite a health status. Health rules advise, never block.
 * Pain applies only up to its `until` date (today when absent).
 */
export function adaptForHealth(s: Session, health: Health, date: string, p: Paces): Session {
  switch (health.kind) {
    case "sick":
      return toEasy(s, Math.floor(Math.min(0.5 * s.durMin, 30)));
    case "cold":
      return toEasy(s, coldMin(s.durMin));
    case "pain":
      if (date > (health.until ?? health.since)) return s;
      return toEasy(s, Math.min(s.durMin, health.level >= 4 ? 20 : 40), "rpe");
    case "recovering":
      // Graduated return (Elliott 2020; research 03 §11.2): light runs, then moderate ones, each for 48 h or more.
      if (date < health.easyUntil) return toEasy(s, Math.floor(Math.min(0.5 * s.durMin, 30)));
      if (date < addDays(health.easyUntil, MODERATE_DAYS)) return toEasy(s, Math.floor(0.75 * s.durMin));
      return date < health.qEasierUntil && isHard(s) && s.type !== "L" ? downgrade(s, p) : s;
    case "easy":
      return date < health.easyUntil ? withoutQ(s) : s;
    default:
      return s;
  }
}

const ADVICE: Record<"sick" | "cold" | "pain_low" | "pain_high", string> = {
  sick: "Repos conseillé tant que tu as de la fièvre. Si tu cours : footing tranquille seulement.",
  cold: "Footing tranquille seulement, pas de fractionné tant que ça dure.",
  pain_low: "Footing tranquille ou vélo, pas de fractionné tant que ça dure.",
  pain_high: "Repos ou vélo conseillé. Si tu cours, arrête-toi si la douleur monte.",
};
const ORIENTATION = "Ta douleur dure depuis plus de 3 jours : montre-la à un kiné ou un médecin.";

function painHealth(
  st: State,
  r: { where: PainSite; walking0to10: number; until?: string },
  today: string,
): { health: Health; orient: boolean } {
  const prev = st.health.kind === "pain" ? st.health : null;
  const since = prev?.since ?? today;
  const orient = r.walking0to10 >= 4 && daysBetween(since, today) + 1 > 3 && prev?.orientationSent !== true;
  const health: Health = {
    kind: "pain",
    since,
    level: r.walking0to10,
    where: r.where,
    ...(r.until ? { until: r.until } : {}),
    orientationSent: orient || prev?.orientationSent === true,
  };
  return { health, orient };
}

type HealthReport = Exclude<Unavailable, { reason: "no_time" } | { reason: "tired" }>;

/** New status, advice and rule for a sick or pain report; `orient` when the physio message is due. */
function healthOf(st: State, r: HealthReport, today: string): { health: Health; warnings: Warning[] } {
  if (r.reason === "sick") {
    const sick = r.feverOrChest;
    const health: Health = { kind: sick ? "sick" : "cold", since: today };
    return { health, warnings: [{ ruleId: sick ? "EV9" : "EV10", message: sick ? ADVICE.sick : ADVICE.cold }] };
  }
  const { health, orient } = painHealth(st, r, today);
  const high = r.walking0to10 >= 4;
  const warnings = [{ ruleId: high ? "EV12" : "EV11", message: high ? ADVICE.pain_high : ADVICE.pain_low }];
  if (orient) warnings.push({ ruleId: "EV12", message: ORIENTATION });
  return { health, warnings };
}

/**
 * EV10: a cold lasts until « Ça va mieux », so every automatic session ahead is shortened at once, not each morning:
 * the week and the watch show the run she may do. The morning decision leaves them as they are.
 */
function coldWeek(st: State, health: Health, today: string): Change[] {
  // Said again while it lasts: the sessions are already shortened.
  if (health.kind !== "cold" || st.health.kind === "cold") return [];
  const p = paces(st.vdot);
  return plannedFrom(st, today)
    .filter((s) => !s.manual)
    .map((s) => change("EV10", s, adaptForHealth(s, health, dateOf(s.start), p)));
}

function healthReport(st: State, r: HealthReport, now: string): Result {
  const today = dateOf(now);
  const session = todayOf(st, now);
  const { health, warnings } = healthOf(st, r, today);
  const jog = session ? adaptForHealth(session, health, today, paces(st.vdot)) : undefined;
  const options = { ...(jog ? { jog } : {}), ...(session && r.reason === "pain" ? { bikeMin: session.durMin } : {}) };
  const changes = coldWeek(st, health, today);
  const state = putAll(
    { ...st, health },
    changes.flatMap((c) => (c.after ? [c.after] : [])),
  );
  return finish(st, state, changes, warnings, { options });
}

function noTime(st: State, now: string): Result {
  const s = todayOf(st, now);
  if (!s) return finish(st, st, [], []);
  const { best } = proposeMoveSlots(s.id, st, now);
  if (best.length > 0) return finish(st, st, [], [], { proposals: [{ sessionId: s.id, slots: best }] });
  const after: Session = { ...s, status: "skipped" };
  return finish(st, put(st, after), [change("EV7", s, after)], []);
}

function tired(st: State, until: string | undefined, now: string): Result {
  const today = dateOf(now);
  const last = until ?? today;
  const rest = plannedFrom(st, today).filter((s) => dateOf(s.start) <= last);
  const changes = rest.map((s) => change("EV8", s, { ...s, status: "skipped" }));
  let state = putAll(
    st,
    changes.flatMap((c) => (c.after ? [c.after] : [])),
  );
  const daysOff = daysBetween(today, last) + 1;
  const after = plannedFrom(state, addDays(last, 1));
  if (daysOff >= 3) {
    const resumed = resumeWeek(after, daysOff);
    state = putAll(state, resumed.week);
    changes.push(...resumed.changes);
  } else {
    const nextHard = after.find((s) => isHard(s));
    if (nextHard && dateOf(nextHard.start) === addDays(last, 1)) {
      const lighter = scaleSession(nextHard, 0.75, 5);
      state = put(state, lighter);
      changes.push(change("EV8", nextHard, lighter));
    }
  }
  return finish(st, state, changes, []);
}

/** EV7 to EV12: Pas dispo. */
export function reportUnavailable(st: State, r: Unavailable, now: string): Result {
  if (r.reason === "no_time") return noTime(st, now);
  if (r.reason === "tired") return tired(st, r.until, now);
  return healthReport(st, r, now);
}

/** EV9: light runs for 3 days after the fever, moderate ones for 2 more, Q one notch easier up to day 10. */
const LIGHT_DAYS = 3;
export const MODERATE_DAYS = 2;
const Q_EASIER_DAYS = 10;
/** EV13: after a cold, 3 more days of easy running (interactions.md, Pas dispo, Malade, Non). */
const COLD_EASY_DAYS = 3;

/** B1: the days of the current or last fever, left out of the morning baselines. */
export function sickDays(health: Health, today: string): string[] {
  const since = health.kind === "sick" || health.kind === "recovering" ? health.since : undefined;
  if (!since) return [];
  const end = health.kind === "recovering" ? addDays(health.easyUntil, -LIGHT_DAYS) : today;
  return [...Array(Math.max(0, daysBetween(since, end) + 1)).keys()].map((k) => addDays(since, k));
}

/** EV13: only the button (or an explicit yes) lifts a sick, cold or pain status and starts the return. */
export function feelBetter(st: State, now: string): Result {
  const today = dateOf(now);
  const h = st.health;
  if (h.kind === "sick") {
    const health: Health = {
      kind: "recovering",
      easyUntil: addDays(today, LIGHT_DAYS),
      qEasierUntil: addDays(today, Q_EASIER_DAYS),
      since: h.since,
    };
    return finish(st, { ...st, health }, [{ ruleId: "EV9", detail: "return" }], []);
  }
  if (h.kind === "cold") {
    // The sessions shortened for the cold are the caller's to rebuild; here, no Q in the next 3 days.
    const health: Health = { kind: "easy", easyUntil: addDays(today, COLD_EASY_DAYS) };
    const p = paces(st.vdot);
    const easier = plannedFrom(st, today)
      .filter((s) => !s.manual)
      .flatMap((s) => {
        const after = adaptForHealth(s, health, dateOf(s.start), p);
        return after === s ? [] : [change("EV13", s, after)];
      });
    const state = putAll(
      { ...st, health },
      easier.flatMap((c) => (c.after ? [c.after] : [])),
    );
    return finish(st, state, [{ ruleId: "EV13", detail: "return" }, ...easier], []);
  }
  if (h.kind === "pain") {
    const resumed = resumeWeek(plannedFrom(st, addDays(today, 1)), daysBetween(h.since, today));
    return finish(st, putAll({ ...st, health: { kind: "ok" } }, resumed.week), resumed.changes, []);
  }
  return finish(st, st, [], [{ ruleId: "EV13", message: "Rien à lever : aucune restriction n'est en cours" }]);
}

/** EV14: new settings, the week repaired by M4, manual sessions kept with a warning. */
export function updateSettings(st: State, patch: Partial<Settings>, now: string): Result {
  const next = { ...st, settings: { ...st.settings, ...patch } };
  const r = replan(next, "EV14", now);
  return finish(st, { ...next, sessions: r.week.sessions }, r.changes, r.warnings, { proposals: r.proposals });
}

const isIcs = (e: CalEvent): boolean => !e.manual && (e.kind === "class" || e.kind === "exam");
const word = (n: number, w: string): string => (n > 1 ? `${w}s` : w);

function describe(events: CalEvent[], verb: string): string | null {
  if (events.length === 0) return null;
  const days = [...new Set(events.map((e) => weekday(e.start)))];
  const day = days.length === 1 ? ` ${DAY_NAMES[days[0] ?? 0]}` : "";
  return `${events.length} cours ${word(events.length, verb)}${day}`;
}

/**
 * EV15: ICS diff, then minimal repair of the sessions it touches. `own`: an event Anna placed herself caused it,
 * so a conflicting run moves even within 12 h, and the banner says which (EV22).
 */
export function onTimetableChange(st: State, newEvents: CalEvent[], now: string, own = false): Result {
  const old = st.cal.filter(isIcs);
  const byId = new Map(old.map((e) => [e.id, e]));
  const newIds = new Set(newEvents.map((e) => e.id));
  const added = newEvents.filter((e) => !byId.has(e.id));
  const removed = old.filter((e) => !newIds.has(e.id));
  const moved = newEvents.filter((e) => {
    const o = byId.get(e.id);
    return o !== undefined && (o.start !== e.start || o.end !== e.end);
  });
  const next = { ...st, cal: [...st.cal.filter((e) => !isIcs(e)), ...newEvents] };
  const r = replan(next, own ? "EV22" : "EV15", now, own);
  const runsMoved = r.changes.filter((c) => c.after && c.before && c.after.start !== c.before.start).length;
  const parts = [
    describe(added, "ajouté"),
    describe(removed, "annulé"),
    describe(moved, "modifié"),
    runsMoved > 0 ? `${runsMoved} ${word(runsMoved, "course")} ${word(runsMoved, "déplacée")}` : null,
  ].filter((x) => x !== null);
  const banner = parts.length > 0 ? parts.join(" · ") : undefined;
  return finish(st, { ...next, sessions: r.week.sessions }, r.changes, r.warnings, {
    proposals: r.proposals,
    ...(banner ? { banner } : {}),
  });
}

/** A run of at least half the planned duration counts for a session (EV16). */
function attach(st: State, a: Activity, used: Set<string>): { s: Session; sameDay: boolean } | null {
  const fits = (s: Session): boolean =>
    s.status === "planned" && s.start !== "" && !used.has(s.id) && a.durMin >= 0.5 * s.durMin;
  const same = st.sessions.find((s) => fits(s) && dateOf(s.start) === dateOf(a.start));
  if (same) return { s: same, sameDay: true };
  const near = st.sessions
    .filter((s) => fits(s) && Math.abs(daysBetween(s.start, a.start)) <= 1)
    .sort((x, y) => Math.abs(daysBetween(x.start, a.start)) - Math.abs(daysBetween(y.start, a.start)))[0];
  return near ? { s: near, sameDay: false } : null;
}

/** EV16, EV17: links runs to sessions, marks missed days, asks when the sync is too old. Never adds a session. */
export function detectMissed(st: State, activities: Activity[], lastSync: string, now: string): Result {
  let state = st;
  const changes: Change[] = [];
  const warnings: Warning[] = [];
  const used = new Set<string>();
  for (const a of [...activities].sort((x, y) => x.start.localeCompare(y.start))) {
    const hit = attach(state, a, used);
    if (!hit) continue;
    used.add(hit.s.id);
    const after: Session = hit.sameDay
      ? { ...hit.s, status: "done" }
      : { ...hit.s, status: "done", start: a.start, manual: true };
    state = put(state, after);
    changes.push(change(hit.sameDay ? "EV16" : "EV16_MOVED", hit.s, after));
  }
  for (const s of state.sessions.filter((x) => x.status === "planned" && x.start !== "")) {
    const dayEnd = `${addDays(dateOf(s.start), 1)}T00:00`;
    if (dayEnd > now) continue;
    if (lastSync < dayEnd) {
      warnings.push({ ruleId: "EV17", message: "Tu as couru ?", sessionId: s.id });
      continue;
    }
    const after: Session = { ...s, status: "missed" };
    state = put(state, after);
    changes.push(change("EV16", s, after));
  }
  return finish(st, state, changes, warnings);
}

/** C3: stores the feel, with what she ran when the run is known (AD1); three "hard" on easy sessions raise a pace check (RC5). */
export function logFeel(st: State, sessionId: string, feel: Feel, run?: Activity): Result {
  const s = find(st, sessionId);
  const log = run
    ? feelLog(s, run, feel, paces(st.vdot))
    : { sessionId, date: dateOf(s.start), feel, rpeTarget: s.rpeTarget };
  const feels = [...st.feels, log];
  const check = evaluateFeels(feels, st.vdot, s.start);
  const warnings = check
    ? [
        {
          ruleId: "RC5",
          message: "Tes trois derniers footings t'ont paru durs : je te conseille de les courir plus doucement",
        },
      ]
    : [];
  return finish(st, { ...st, feels }, [], warnings);
}

const refuse = (st: State, id: string, message: string): Result => ({
  ok: false,
  state: st,
  previous: st,
  changes: [],
  warnings: [{ ruleId: "EV21", message, sessionId: id }],
});

/**
 * EV21: « Oui, je l'ai faite » for a session no synced run matched: done, as Garmin would have marked it. Only a
 * session that has started can be done.
 */
export function confirmDone(st: State, id: string, now: string): Result {
  const s = find(st, id);
  if (s.status !== "planned" || s.start > now)
    return refuse(st, id, "Cette séance n'a pas encore eu lieu : tu pourras la valider après");
  const after: Session = { ...s, status: "done" };
  return finish(st, put(st, after), [change("EV21", s, after)], []);
}

/** EV21: « Passer cette séance » or « Non, je l'ai sautée »: skipped, never made up, nothing else moves (EV16). */
export function skipSession(st: State, id: string): Result {
  const s = find(st, id);
  if (s.status !== "planned") return refuse(st, id, "Cette séance n'est plus prévue");
  const after: Session = { ...s, status: "skipped" };
  return finish(st, put(st, after), [change("EV21", s, after)], []);
}
