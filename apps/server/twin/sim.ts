import * as coach from "@annarrive/coach";
import { type CalendarEvent, changeResponseSchema, moveSlotsSchema, type PlannedSession } from "@annarrive/protocol";
import { toSession } from "../src/coach-adapter.ts";
import { onWatch, workoutHash } from "../src/garmin/workout.ts";
import { occurrences } from "../src/services/calendar.ts";
import { planTables } from "../src/storage/stores.ts";
import { addDays, addMinutes, dateOf, mondayOf } from "../src/time.ts";
import { createWorld, ICS_URL, type ReggieAsk, START, type World } from "./world.ts";

const STEP_MIN = 15;
/** Chance of a gesture in each quarter of an hour she is awake (7:00 to 23:00): about 6 a day. */
const ACTION_RATE = 0.1;
/** Share of the gestures that return a change and are then undone, to check Annuler. */
const UNDO_RATE = 0.3;
// The app's own « lent » threshold (incidents, SLOW_MS): a CI runner may be 2× slower than a laptop, 3 s still catches a real stall.
export const SLOW_MS = 3000;
/** H1 (algo.md): 30 min after a class or anything else, `max(30, travelMin)` after work. */
const AFTER_EVENT_MIN = 30;
const WEEK_RISE = 1.1;
/** G2b: the long run she already runs may pass G2 by 10 % of the cap, plus a minute of rounding. */
const G2_SLACK = 1.1;
/** G2b: the shortest an easy run gets under a load cap. */
const G2B_FLOOR = 20;
/** H9 (placement.ts `FREEZE_H`). */
const FREEZE_MIN = 12 * 60;
const QUALITY = new Set(["T", "CRUISE", "I", "R", "SPE", "FARTLEK", "TEST"]);

export const KINDS = {
  settings: 8,
  move: 10,
  skip: 4,
  change: 4,
  pasDispo: 3,
  sick: 2,
  feelBetter: 3,
  addWork: 3,
  addMuscu: 3,
  removeEvent: 3,
  timetable: 2,
  cancelClass: 2,
  doneBefore: 2,
  reggie: 6,
  freeRun: 3,
} as const;
export type Kind = keyof typeof KINDS;
const isKind = (k: string): k is Kind => k in KINDS;
export type Action = { step: number; kind: Kind; r: [number, number, number, number] };
export type Failure = { step: number; at: string; action: string; invariant: string; detail: string };

/** mulberry32: small, fast, and the same sequence on every machine. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hourAt = (step: number): number => new Date(START.getTime() + step * STEP_MIN * 60_000).getUTCHours() + 1;

/** The whole series of gestures, drawn before the run: a subset of it replays the same gestures (shrinking). */
export function script(seed: number, days: number): Action[] {
  const random = rng(seed);
  const total = Object.values(KINDS).reduce((a, b) => a + b, 0);
  const actions: Action[] = [];
  for (let step = 1; step < (days * 24 * 60) / STEP_MIN; step++) {
    const hour = hourAt(step) % 24;
    if (hour < 7 || hour >= 23 || random() >= ACTION_RATE) continue;
    let left = random() * total;
    const kind = Object.keys(KINDS)
      .filter(isKind)
      .find((k) => {
        left -= KINDS[k];
        return left < 0;
      });
    if (kind) actions.push({ step, kind, r: [random(), random(), random(), random()] });
  }
  return actions;
}

const pick = <T>(list: readonly T[], r: number): T | undefined => list[Math.floor(r * list.length)];
/** A number from the session id and the seed: how she runs it never depends on which gestures were kept. */
function outcome(seed: number, id: string): number {
  let h = seed;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 2654435761);
  return rng(h)();
}

const active = (s: PlannedSession) => s.status === "planned" || s.status === "done";

type Context = { w: World; seed: number; failures: Failure[]; step: number; action: string; ran: Set<string> };

function fail(ctx: Context, invariant: string, detail: string): void {
  ctx.failures.push({ step: ctx.step, at: ctx.w.now(), action: ctx.action, invariant, detail });
}

async function call(ctx: Context, method: string, path: string, body?: unknown) {
  const res = await ctx.w.call(method, path, body);
  if (res.status >= 500) fail(ctx, "aucune 5xx", `${method} ${path} → ${res.status} ${JSON.stringify(res.json)}`);
  if (res.ms > SLOW_MS) fail(ctx, "réponse < 3 s", `${method} ${path} en ${Math.round(res.ms)} ms`);
  return res;
}

const settle = () => new Promise((resolve) => setImmediate(resolve)).then(() => new Promise((r) => setImmediate(r)));

// ---------- Her gestures ----------

function upcoming(ctx: Context): PlannedSession[] {
  const now = ctx.w.now();
  return ctx.w.stores.plannedSession
    .overlapping(now, `${addDays(dateOf(now), 14)}T00:00`)
    .filter((s) => s.status === "planned" && s.start > now);
}

function manualEvents(ctx: Context): CalendarEvent[] {
  return ctx.w.stores.calendarEvent
    .list()
    .filter((e) => e.manual && (e.kind === "work" || e.kind === "strength"))
    .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

function settingsPatch(r: Action["r"]): Record<string, unknown> {
  const fields: Record<string, unknown>[] = [
    { runsPerWeek: pick([2, 3, 4, 5], r[1]) },
    { earliest: pick(["06:00", "07:00", "08:30", "12:00", "17:00", "19:30", "21:00"], r[1]) },
    { latestEnd: pick(["00:00", "20:00", "21:30", "22:30", "23:30"], r[1]) },
    { noRunDays: pick([[], [3], [1, 5], [6, 7], [2, 4, 6]], r[1]) },
    { travelMin: pick([0, 15, 30, 60, 120], r[1]) },
    { preferredLongDays: pick([[6], [7], [6, 7], [3]], r[1]) },
    { bedtime: pick(["22:00", "23:00", "00:30"], r[1]) },
    { preferredHour: pick(["07:00", "12:30", "18:00", null], r[1]) },
  ];
  return pick(fields, r[0]) ?? {};
}

function eventInput(ctx: Context, kind: "work" | "strength", r: Action["r"]) {
  const day = addDays(dateOf(ctx.w.now()), Math.floor(r[0] * 8));
  const [from, to] = pick(
    [
      ["08:00", "12:00"],
      ["13:00", "17:30"],
      ["17:30", "18:45"],
      ["18:00", "19:15"],
      ["19:00", "22:00"],
      ["06:30", "07:30"],
    ],
    r[1],
  ) ?? ["18:00", "19:00"];
  return {
    kind,
    title: kind === "work" ? "Travail" : "Muscu",
    start: `${day}T${from}`,
    end: `${day}T${to}`,
    legs: r[2] < 0.5,
    recurrence: r[3] < 0.5 ? "none" : "weekly",
  };
}

type Gesture = (ctx: Context, r: Action["r"], session: PlannedSession | undefined) => Promise<unknown>;
const json = async (ctx: Context, method: string, path: string, body?: unknown) =>
  (await call(ctx, method, path, body)).json;
/** A gesture on one of her upcoming sessions; nothing when none is left. */
const onSession =
  (path: string, body: (r: Action["r"]) => unknown = () => undefined): Gesture =>
  async (ctx, r, session) => {
    if (!session) return null;
    ctx.action += ` ${session.id}`;
    return json(ctx, "POST", `/api/sessions/${session.id}/${path}`, body(r));
  };

/** Each gesture through the real API, as the app's buttons send it. Returns the response a change may be in. */
const gestures: Record<Kind, Gesture> = {
  settings: (ctx, r) => json(ctx, "PATCH", "/api/profile", settingsPatch(r)),
  async move(ctx, r, session) {
    if (!session) return null;
    const slots = moveSlotsSchema.safeParse(await json(ctx, "GET", `/api/sessions/${session.id}/slots`));
    const forced = r[2] < 0.2;
    const list = slots.success ? (forced ? slots.data.forbidden : slots.data.best) : [];
    const start = pick(list, r[1])?.slot.start ?? `${dateOf(session.start)}T${forced ? "23:30" : "18:00"}`;
    ctx.action += ` ${session.id} → ${start}`;
    return json(ctx, "POST", `/api/sessions/${session.id}/move`, { start });
  },
  skip: onSession("skip"),
  change: onSession("change", (r) => ({ option: pick(["shorter", "easier", "equivalent", "jog30"], r[1]) })),
  pasDispo: (ctx, r) =>
    json(ctx, "POST", "/api/unavailable", {
      reason: r[3] < 0.5 ? "no_time" : "tired",
      until: r[1] < 0.5 ? undefined : addDays(dateOf(ctx.w.now()), Math.floor(r[2] * 4)),
    }),
  sick: (ctx, r) =>
    json(
      ctx,
      "POST",
      "/api/unavailable",
      r[1] < 0.6
        ? { reason: "sick", feverOrChest: r[2] < 0.5 }
        : { reason: "pain", where: "genou", walking0to10: Math.floor(r[2] * 8) },
    ),
  feelBetter: (ctx) => json(ctx, "POST", "/api/feel-better"),
  addWork: (ctx, r) => json(ctx, "POST", "/api/events", eventInput(ctx, "work", r)),
  addMuscu: (ctx, r) => json(ctx, "POST", "/api/events", eventInput(ctx, "strength", r)),
  async removeEvent(ctx, r) {
    const event = pick(manualEvents(ctx), r[0]);
    if (!event) return null;
    const scope = pick(["all", "following", "occurrence"], r[1]) ?? "all";
    const day = [dateOf(event.start), dateOf(ctx.w.now())].sort()[1];
    ctx.action += ` ${event.title} ${event.start} ${scope}`;
    return json(ctx, "DELETE", `/api/events/${event.id}?scope=${scope}${scope === "all" ? "" : `&date=${day}`}`);
  },
  timetable(ctx) {
    ctx.w.setTimetable(ctx.w.timetableVersion() === 1 ? 2 : 1);
    return json(ctx, "POST", "/api/timetable/refresh");
  },
  async cancelClass(ctx, r) {
    const now = ctx.w.now();
    const classes = ctx.w.stores.calendarEvent
      .overlapping(now, `${addDays(dateOf(now), 7)}T00:00`)
      .filter((e) => e.kind === "class" && !e.cancelled);
    const target = pick(classes, r[0]);
    if (!target) return null;
    ctx.action += ` ${target.title} ${target.start}`;
    return json(ctx, "POST", `/api/events/${target.id}/cancel`);
  },
  // « Oui, je l'ai faite » on a run later today, before she has run it.
  doneBefore: (ctx, r) =>
    onSession("done")(
      ctx,
      r,
      upcoming(ctx).find((s) => dateOf(s.start) === dateOf(ctx.w.now())),
    ),
  reggie: (ctx, r, session) => reggie(ctx, r, session),
  async freeRun(ctx, r) {
    const durMin = 25 + Math.floor(r[1] * 35);
    ctx.w.garmin.add(addMinutes(ctx.w.now(), -durMin - 5), durMin, (durMin * 60_000) / 385, 140, false, 50);
    return null;
  },
};

/** A Reggie turn: the model would pick the tool; the twin picks it and Reggie's own tool code runs it. */
async function reggie(ctx: Context, r: Action["r"], session: PlannedSession | undefined): Promise<unknown> {
  const today = dateOf(ctx.w.now());
  const asks: ReggieAsk[] = [
    { name: "report_unavailable", input: { reason: "tired", until: addDays(today, 1) } },
    { name: "update_setting", input: { patch: settingsPatch([r[1], r[2], 0, 0]) } },
    { name: "add_event", input: eventInput(ctx, "strength", [r[1], r[2], r[3], 0]) },
    { name: "request_session", input: { type: "E", durMin: 40, replace: "add", apply: true } },
    { name: "feel_better", input: {} },
  ];
  if (session)
    asks.push(
      { name: "change_session", input: { sessionId: session.id, option: "easier" } },
      { name: "move_session", input: { sessionId: session.id, start: `${addDays(today, 1)}T18:00` } },
    );
  const ask = pick(asks, r[0]);
  if (!ask) return null;
  ctx.action += ` ${ask.name} ${JSON.stringify(ask.input)}`;
  ctx.w.askReggie(ask);
  const res = await call(ctx, "POST", "/api/chat", { text: "Peux-tu m'aider ?" });
  if (typeof res.json === "string" && res.json.includes("event: error"))
    fail(ctx, "Reggie répond", res.json.split("\n").find((l) => l.startsWith("data:")) ?? "");
  return null;
}

/** Her runs: each planned session of the day is run on time, late, shorter or not at all, once its hour comes. */
function runSessions(ctx: Context): void {
  const now = ctx.w.now();
  const today = dateOf(now);
  for (const s of ctx.w.stores.plannedSession.overlapping(`${today}T00:00`, `${addDays(today, 1)}T00:00`)) {
    if (!active(s) || s.start > now || dateOf(s.start) !== today || ctx.ran.has(s.id)) continue;
    ctx.ran.add(s.id);
    runOne(ctx, s);
  }
}

const PACE_S_KM: Partial<Record<PlannedSession["type"], number>> = { E: 385, RECUP: 385, L: 390 };

function runOne(ctx: Context, s: PlannedSession): void {
  const o = outcome(ctx.seed, s.id);
  if (o < 0.2) return;
  const late = o < 0.3 ? 75 : 0;
  const durMin = o < 0.45 ? s.durMin * 0.6 : s.durMin;
  const distM = (durMin * 60_000) / (PACE_S_KM[s.type] ?? 340);
  ctx.w.garmin.add(addMinutes(s.start, late), durMin, distM, 148, false, o < 0.7 ? 50 : 75);
}

// ---------- Invariants ----------

type Snapshot = Map<string, string>;

function snapshot(w: World): Snapshot {
  const rows = new Map<string, string>();
  for (const table of planTables)
    for (const row of w.db.prepare(`SELECT id, data FROM ${table}`).all())
      rows.set(`${table}:${String(row.id)}`, String(row.data));
  return rows;
}

/** Classes come from her feed and proposals from the coach: neither is a change of hers to undo. */
function journaled(key: string, data: string | undefined): boolean {
  if (key.startsWith("proposal:")) return false;
  return !(key.startsWith("calendar_event:") && data?.includes('"kind":"class"') && data.includes('"manual":false'));
}

/** A synced run is Garmin's data; only setting it aside (RC21) is her change. */
const setAside = (data: string | undefined) => (data?.includes('"setAside"') ? data : undefined);

function changedKeys(a: Snapshot, b: Snapshot): string[] {
  return [...new Set([...a.keys(), ...b.keys()])].filter((k) => {
    const [x, y] = k.startsWith("activity:") ? [setAside(a.get(k)), setAside(b.get(k))] : [a.get(k), b.get(k)];
    return x !== y && journaled(k, a.get(k) ?? b.get(k));
  });
}

function checkJournal(ctx: Context, before: Snapshot, logBefore: Map<string, string | undefined>): void {
  const touched = new Set<string>();
  for (const entry of ctx.w.stores.changeLog.overlapping("", "9999")) {
    if (logBefore.has(entry.id) && logBefore.get(entry.id) === entry.undoneAt) continue;
    for (const m of entry.mutations) touched.add(`${m.table}:${m.id}`);
  }
  const missing = changedKeys(before, snapshot(ctx.w)).filter((k) => !touched.has(k));
  if (missing.length > 0) fail(ctx, "tout changement est au journal", missing.slice(0, 5).join(", "));
}

const changeLogState = (w: World) =>
  new Map(w.stores.changeLog.overlapping("", "9999").map((c) => [c.id, c.undoneAt] as const));

function checkWatch(ctx: Context): void {
  const today = dateOf(ctx.w.now());
  const syncs = ctx.w.stores.watchSync.list();
  const onWatch_ = ctx.w.stores.plannedSession
    .overlapping(`${today}T00:00`, `${addDays(today, 7)}T00:00`)
    .filter((s) => onWatch(s, today));
  for (const s of onWatch_) {
    const sync = syncs.find((x) => x.id === s.id);
    if (sync?.status !== "sent" || sync.hash !== workoutHash(s))
      fail(
        ctx,
        "montre à jour",
        `${s.type} ${s.start} [${s.id}] : ${sync ? `${sync.status}, contenu ancien` : "absente"}`,
      );
  }
  const sent = new Set(syncs.flatMap((x) => (x.workoutId === undefined ? [] : [x.workoutId])));
  const extra = [...ctx.w.garmin.watch.keys()].filter((id) => !sent.has(id));
  if (extra.length > 0) fail(ctx, "montre à jour", `${extra.length} entraînement(s) sur la montre sans séance`);
  if (ctx.w.garmin.unknownDeletes > 0) fail(ctx, "montre à jour", "suppression d'un entraînement inconnu");
}

/** Kinds that may take runs out of a week: fewer runs, fewer free days, a new constraint, being ill. */
const REPLANS = new Set<string>([
  "settings",
  "pasDispo",
  "sick",
  "feelBetter",
  "addWork",
  "addMuscu",
  "removeEvent",
  "timetable",
  "cancelClass",
  "reggie",
  "change",
  "undo",
]);
const EXPLICIT = new Set(["skip", "pasDispo", "sick", "reggie", "doneBefore", "undo"]);

function checkFuture(ctx: Context, before: PlannedSession[], kind: string): void {
  const now = ctx.w.now();
  const ahead = before.filter((s) => s.start > now && s.status === "planned");
  const after = new Map(ahead.map((s) => [s.id, ctx.w.stores.plannedSession.get(s.id)]));
  for (const s of ahead) {
    const now_ = after.get(s.id);
    if (now_ && now_.status !== "planned" && now_.status !== "done" && !EXPLICIT.has(kind))
      fail(ctx, "aucune séance à venir sautée en silence", `${s.type} ${s.start} [${s.id}] → ${now_.status}`);
  }
  if (REPLANS.has(kind)) return;
  const weekCount = (list: PlannedSession[]) => {
    const m = new Map<string, number>();
    for (const s of list)
      if (s.start > now && active(s)) m.set(mondayOf(dateOf(s.start)), (m.get(mondayOf(dateOf(s.start))) ?? 0) + 1);
    return m;
  };
  const was = weekCount(before);
  const is = weekCount(upcomingAll(ctx));
  for (const [monday, n] of was) {
    const left = is.get(monday) ?? 0;
    if (left < n - (kind === "skip" ? 1 : 0))
      fail(ctx, "aucune séance à venir disparue", `semaine du ${monday} : ${n} → ${left} séances à venir`);
  }
}

function upcomingAll(ctx: Context): PlannedSession[] {
  const now = ctx.w.now();
  return ctx.w.stores.plannedSession.overlapping(now, `${addDays(dateOf(now), 21)}T00:00`);
}

async function checkPlan(ctx: Context): Promise<void> {
  const now = ctx.w.now();
  const today = dateOf(now);
  const profile = ctx.w.services.plan.profile();
  const sessions = upcomingAll(ctx).filter((s) => s.start > now && s.status === "planned" && !s.manual);
  const events = ctx.w.stores.calendarEvent
    .overlapping(`${today}T00:00`, `${addDays(today, 22)}T00:00`)
    .filter((e) => !(e.kind === "class" && e.cancelled))
    .flatMap((e) => occurrences(e, today, addDays(today, 22)));
  const after = (e: CalendarEvent) =>
    e.kind === "work" ? Math.max(AFTER_EVENT_MIN, profile.travelMin) : AFTER_EVENT_MIN;
  for (const s of sessions) {
    const end = addMinutes(s.start, s.durMin);
    const hit = events.find(
      (e) => s.start < addMinutes(e.end, after(e)) && addMinutes(end, profile.travelMin) > e.start,
    );
    const latest = profile.latestEnd === "00:00" ? "24:00" : profile.latestEnd;
    const endClock = dateOf(end) > dateOf(s.start) ? "24:00" : end.slice(11, 16);
    const weekday = ((new Date(`${dateOf(s.start)}T00:00Z`).getUTCDay() + 6) % 7) + 1;
    const hours = s.start.slice(11, 16) < profile.earliest || endClock > latest || profile.noRunDays.includes(weekday);
    // H9: a run within 12 h is only proposed a new slot, never moved by a replan.
    if ((!hit && !hours) || s.start < addMinutes(now, FREEZE_MIN) || (await noPlace(ctx, s))) continue;
    if (hit)
      fail(
        ctx,
        "aucun chevauchement (H1, trajet compris)",
        `${s.type} ${s.start} ${s.durMin} min [${s.id}] et ${hit.kind} ${hit.start} à ${hit.end}`,
      );
    if (hours)
      fail(
        ctx,
        "horaires respectés (H2)",
        `${s.type} ${s.start} à ${end.slice(11)} [${s.id}], réglages ${profile.earliest} à ${profile.latestEnd}, sans course [${profile.noRunDays}]`,
      );
  }
  checkWeeks(ctx);
  checkMinutes(ctx);
}

/** C1: what the watch counts down is whole minutes, or whole 10 s under 2 min; a distance step ends on its distance. */
function checkMinutes(ctx: Context): void {
  const whole = (min: number) => Math.abs(min * (min >= 2 ? 1 : 6) - Math.round(min * (min >= 2 ? 1 : 6))) < 1e-6;
  for (const s of upcomingAll(ctx).filter((x) => x.status === "planned")) {
    const bad = s.steps.find((st) => !st.distM && st.durMin !== undefined && !whole(st.durMin));
    if (bad)
      fail(ctx, "durées en minutes entières (C1)", `${s.type} ${s.start} [${s.id}] : étape de ${bad.durMin} min`);
  }
}

/**
 * A4 (placement.ts `replan`): a run with no valid slot left in its week stays where it is, with a warning, since only
 * she skips a run. The same coach answers « Déplacer »: no slot offered means none exists.
 */
async function noPlace(ctx: Context, s: PlannedSession): Promise<boolean> {
  const slots = moveSlotsSchema.safeParse((await call(ctx, "GET", `/api/sessions/${s.id}/slots`)).json);
  // P25: a replan never brings a run onto today, though she may move one there herself.
  const today = dateOf(ctx.w.now());
  const allowed = slots.data?.best.filter(({ slot }) => dateOf(slot.start) !== today || dateOf(s.start) === today);
  return allowed !== undefined && allowed.length === 0;
}

/** A1b, right after a week is built: no three run days in a row while a week without them fits. */
async function checkSpread(ctx: Context, monday: string): Promise<void> {
  const week = ctx.w.stores.plannedSession.overlapping(`${monday}T00:00`, `${addDays(monday, 7)}T00:00`).filter(active);
  const runDays = new Set(week.map((s) => dateOf(s.start)));
  const first = [...runDays].sort().find((d) => runDays.has(addDays(d, 1)) && runDays.has(addDays(d, 2)));
  if (!first) return;
  const three = week.filter((s) => [0, 1, 2].some((k) => dateOf(s.start) === addDays(first, k)));
  // Avoidable when one of the three can go to a day that breaks the row (the coach's own « Déplacer » slots).
  for (const s of three.filter((x) => x.status === "planned" && !x.manual)) {
    const slots = moveSlotsSchema.safeParse((await call(ctx, "GET", `/api/sessions/${s.id}/slots`)).json);
    const free = (d: string) => !runDays.has(d) || d === dateOf(s.start);
    const breaks = slots.data?.best.some(({ slot }) => {
      const d = dateOf(slot.start);
      const left = new Set([...runDays].filter((x) => x !== dateOf(s.start)).concat(d));
      return free(d) && ![...left].some((x) => left.has(addDays(x, 1)) && left.has(addDays(x, 2)));
    });
    if (breaks)
      return fail(
        ctx,
        "pas 3 jours de course de suite quand c'est évitable (A1b)",
        `semaine du ${monday}, à partir du ${first} : ${s.type} ${s.start} avait un créneau ailleurs`,
      );
  }
}

function checkWeeks(ctx: Context): void {
  const now = ctx.w.now();
  const monday = mondayOf(dateOf(now));
  for (const m of [monday, addDays(monday, 7)]) {
    const week = ctx.w.stores.plannedSession.overlapping(`${m}T00:00`, `${addDays(m, 7)}T00:00`).filter(active);
    const quality = week.filter((s) => QUALITY.has(s.type) && coach.isHard(toSession(s)));
    if (quality.length > 2)
      fail(
        ctx,
        "au plus 2 séances dures par semaine",
        `semaine du ${m} : ${quality.map((s) => `${s.type} ${s.start}`).join(", ")}`,
      );
    const ran = [1, 2, 3, 4].map((k) =>
      ctx.w.stores.activity
        .overlapping(`${addDays(m, -7 * k)}T00:00`, `${addDays(m, -7 * k + 7)}T00:00`)
        .reduce((sum, a) => sum + a.durMin, 0),
    );
    const cap = WEEK_RISE * Math.max(...ran);
    // What the coach built: a run she moved or asked for herself is hers (H10, RQ9 checks a request on its own).
    const auto = week.filter((s) => !s.manual);
    const built = auto.reduce((sum, s) => sum + s.durMin, 0);
    // G2 never takes a run out: when every run but the long one is down to its 20 min (G2b), the cap cannot hold.
    const floors = auto.every((s) => s.type === "L" || s.durMin <= G2B_FLOOR);
    if (cap > 0 && built > cap * G2_SLACK + 1 && !floors)
      fail(
        ctx,
        "semaine sous G2 (+ 10 % de G2b)",
        `semaine du ${m} : ${Math.round(built)} min pour ${Math.round(cap)} au plus`,
      );
  }
}

/** Annuler on the gesture's change: the plan must come back exactly as it was before the gesture. */
async function checkUndo(ctx: Context, before: Snapshot, logBefore: Map<string, string | undefined>, json: unknown) {
  const change = changeResponseSchema.safeParse(json).data?.change;
  const fresh = ctx.w.stores.changeLog.overlapping("", "9999").filter((c) => !logBefore.has(c.id));
  if (!change || fresh.length !== 1) return;
  ctx.action += " puis Annuler";
  const res = await call(ctx, "POST", `/api/changes/${change.id}/undo`);
  if (res.status !== 200) return fail(ctx, "Annuler rend l'état exact", `${res.status} ${JSON.stringify(res.json)}`);
  const diff = changedKeys(before, snapshot(ctx.w));
  if (diff.length > 0) fail(ctx, "Annuler rend l'état exact", diff.slice(0, 5).join(", "));
}

// ---------- The run ----------

/** `world`: the server as the run left it, to read when a failure needs explaining. */
export type Result = { failures: Failure[]; steps: number; actions: number; ms: number; world: World };

/** Plays `actions` over `days` from Monday 23 November; stops at the first failure unless `keepGoing`. */
export async function simulate(
  seed: number,
  days: number,
  actions: Action[],
  { keepGoing = false, lastStep = Number.POSITIVE_INFINITY } = {},
): Promise<Result> {
  const started = performance.now();
  const w = await createWorld();
  const ctx: Context = { w, seed, failures: [], step: 0, action: "inscription", ran: new Set() };
  // Onboarding as the app sends it: the bridge's year of runs first, then timetable, programme, settings, muscu.
  await w.services.garmin?.syncActivities();
  await call(ctx, "PUT", "/api/timetable/url", { url: ICS_URL });
  await call(ctx, "PUT", "/api/program", { goal: { distanceM: 21097.5, date: "2027-04-04", targetMin: 108 } });
  await call(ctx, "PATCH", "/api/profile", {
    runsPerWeek: 4,
    earliest: "07:00",
    latestEnd: "21:30",
    noRunDays: [],
    bedtime: "23:00",
    preferredLongDays: [6, 7],
    useSleepHr: true,
    travelMin: 15,
  });
  for (const [day, start, end, legs] of [
    [0, "18:00", "19:15", true],
    [2, "12:30", "13:30", false],
    [4, "17:30", "18:45", true],
  ] as const)
    await call(ctx, "POST", "/api/events", {
      kind: "strength",
      title: "Muscu",
      start: `${addDays("2026-11-23", day)}T${start}`,
      end: `${addDays("2026-11-23", day)}T${end}`,
      legs,
      recurrence: "weekly",
    });
  for (const monday of ["2026-11-23", "2026-11-30"]) await checkSpread(ctx, monday);
  const byStep = new Map(actions.map((a) => [a.step, a]));
  const steps = (days * 24 * 60) / STEP_MIN;
  for (let step = 1; step < Math.min(steps, lastStep + 1) && (keepGoing || ctx.failures.length === 0); step++) {
    ctx.step = step;
    w.setNow(new Date(START.getTime() + step * STEP_MIN * 60_000));
    const before = snapshot(w);
    const logBefore = changeLogState(w);
    const futureBefore = upcomingAll(ctx);
    ctx.action = "le temps passe";
    runSessions(ctx);
    await w.scheduler.tick();
    await settle();
    checkWatch(ctx);
    // Sunday 18:00: the next week was just built.
    if (w.now().endsWith("18:00") && new Date(`${dateOf(w.now())}T00:00Z`).getUTCDay() === 0)
      await checkSpread(ctx, addDays(dateOf(w.now()), 1));
    const a = byStep.get(step);
    let kind = "tick";
    if (a) {
      kind = a.kind;
      ctx.action = a.kind;
      const actBefore = snapshot(w);
      const actLog = changeLogState(w);
      const json = await gestures[a.kind](ctx, a.r, pick(upcoming(ctx), a.r[0]));
      await settle();
      if (a.r[3] < UNDO_RATE && a.kind !== "freeRun") {
        await checkUndo(ctx, actBefore, actLog, json);
        await settle();
      }
    }
    checkJournal(ctx, before, logBefore);
    checkFuture(ctx, futureBefore, kind);
    await checkPlan(ctx);
  }
  return { failures: ctx.failures, steps, actions: actions.length, ms: performance.now() - started, world: w };
}
