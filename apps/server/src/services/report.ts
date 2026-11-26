import {
  type CalendarEvent,
  type ChatMessage,
  type PlannedSession,
  paceLabel,
  plannedSessionSchema,
} from "@annarrive/protocol";
import type { Activity, ChangeEntry, Stores } from "../storage/stores.ts";
import { addDays, addMinutes, dateOf, frenchWeekday, isoWeekOf, mondayOf, toParisLocal } from "../time.ts";
import { occurrences } from "./calendar.ts";
import { clock } from "./level.ts";

/** G2: a week's run minutes ≤ 1.10 × the best of the 4 weeks run before (algo.md, soft). */
const WEEK_RISE = 1.1;
const CHRONIC_WEEKS = 4;
/** H1's buffer after a class (algo.md); after work it is `max(30, travelMin)`. */
const AFTER_EVENT_MIN = 30;
/** Two identical messages this close are a double send, not a repeat. */
const DUPLICATE_MS = 120_000;
const BREADCRUMBS = 5;
/** Sanity bounds of F18: slower than 12:00 /km is a walk, faster than 2:30 a GPS glitch. */
const PACE_BOUNDS_S_KM: [number, number] = [150, 720];

export type ReportRange = { from: string; to: string; now: string };

const paris = (iso: string): string => toParisLocal(new Date(iso));
const day = (local: string): string =>
  `${frenchWeekday(dateOf(local)).slice(0, 3)} ${local.slice(8, 10)}/${local.slice(5, 7)}`;
const moment = (local: string): string => `${day(local)} ${local.slice(11, 16)}`;
const inRange = (local: string, r: ReportRange): boolean => dateOf(local) >= r.from && dateOf(local) <= r.to;
const end = (s: { start: string; durMin: number }): string => addMinutes(s.start, s.durMin);
const active = (s: PlannedSession): boolean => s.status === "planned" || s.status === "done";
const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * What `cli/rapport.ts` prints: a week of Anna's data in one read, to paste to an agent when something looks off.
 * Read only; every section ends in what it found, the last one in what looks wrong.
 */
export function weekReport(stores: Stores, r: ReportRange): string {
  const sessions = stores.plannedSession
    .overlapping(`${r.from}T00:00`, `${addDays(r.to, 1)}T00:00`)
    .filter((s) => inRange(s.start, r));
  const changes = stores.changeLog
    .overlapping(`${addDays(r.from, -1)}`, `${addDays(r.to, 2)}`)
    .filter((c) => inRange(paris(c.at), r));
  const runs = stores.activity.overlapping(`${r.from}T00:00`, `${addDays(r.to, 1)}T00:00`);
  const chat = stores.chatMessage
    .overlapping(addDays(r.from, -1), addDays(r.to, 2))
    .filter((m) => inRange(paris(m.at), r));
  const incidents = stores.incident
    .overlapping(addDays(r.from, -1), addDays(r.to, 2))
    .filter((i) => inRange(paris(i.at), r));
  return [
    `Rapport du ${r.from} au ${r.to} (lu le ${r.now.replace("T", " ")})`,
    section("Profil et programme", profileLines(stores)),
    section("Séances prévues", sessionLines(stores, sessions)),
    section("Journal des changements", changes.flatMap(changeLines)),
    section(
      "Courses synchronisées",
      runs.map((a) => runLine(stores, a)),
    ),
    section("Niveau", levelLines(stores, r)),
    section("Reggie", chat.map(chatLine)),
    section(
      "Incidents",
      incidents.flatMap((i) => [
        `${moment(paris(i.at))}  ${i.type}  ${oneLine(i.message)}  (${i.route})`,
        ...i.breadcrumbs.slice(-BREADCRUMBS).map((b) => `    ${paris(b.at).slice(11, 16)} ${b.kind} ${b.label}`),
      ]),
    ),
    section("Anomalies", anomalies(stores, r, { sessions, changes, chat, incidents })),
  ].join("\n\n");
}

function section(title: string, lines: string[]): string {
  return [`== ${title} ==`, ...(lines.length > 0 ? lines : ["(rien)"])].join("\n");
}

function profileLines(stores: Stores): string[] {
  const p = stores.profile.get("current")?.value;
  const program = stores.program.get("current")?.value;
  const health = stores.health.get("current")?.value;
  const goal = program?.goal;
  return [
    p
      ? `${p.runsPerWeek} courses/sem, ${p.earliest} à ${p.latestEnd}, coucher ${p.bedtime}, trajet ${p.travelMin} min, jours sans course [${p.noRunDays.join(",")}], sortie longue [${p.preferredLongDays?.join(",") ?? "libre"}]${p.preferredHour ? `, heure ${p.preferredHour}` : ""}`
      : "Aucun profil (onboarding pas fini)",
    goal
      ? `Objectif ${goal.distanceM / 1000} km le ${goal.date}${goal.targetMin ? ` en ${clock(goal.targetMin)}` : ""}${goal.name ? ` (${goal.name})` : ""}, commencé le ${program?.startedOn ?? "?"}`
      : "Aucun objectif",
    `Santé : ${health?.kind ?? "ok"}`,
  ];
}

function sessionLines(stores: Stores, sessions: PlannedSession[]): string[] {
  const byWeek = Map.groupBy(sessions, (s) => isoWeekOf(dateOf(s.start)));
  return [...byWeek].flatMap(([week, list]) => [
    `${week} (${list.filter(active).reduce((sum, s) => sum + s.durMin, 0)} min prévues ou faites)`,
    ...list.map((s) => {
      const flags = [s.manual && "manuelle", s.frozen && "figée"].filter(Boolean).join(", ");
      const watch = stores.watchSync.get(s.id)?.status ?? "non envoyée";
      return `  ${moment(s.start)}  ${s.type} ${s.durMin} min  ${s.status}${flags ? ` (${flags})` : ""}  montre ${watch}  [${s.id}]`;
    }),
  ]);
}

function changeLines(c: ChangeEntry): string[] {
  const head = `${moment(paris(c.at))}  ${c.summary}${c.undoneAt ? `  (annulé ${paris(c.undoneAt).slice(11, 16)})` : ""}`;
  return [
    head,
    ...c.mutations.map((m) => `    ${m.table === "planned_session" ? sessionDiff(m) : `${m.table} ${m.id}`}`),
  ];
}

type Mutation = ChangeEntry["mutations"][number];
const asSession = (doc: unknown): PlannedSession | null => plannedSessionSchema.safeParse(doc).data ?? null;

/** The status and time that moved, not the whole document: what a reader needs to follow a week. */
function sessionDiff(m: Mutation): string {
  const before = asSession(m.before);
  const after = asSession(m.after);
  const name = (s: PlannedSession) => `${s.type} ${moment(s.start)} ${s.durMin} min`;
  if (!before && after) return `+ ${name(after)} [${m.id}]`;
  if (before && !after) return `- ${name(before)} [${m.id}]`;
  if (!before || !after) return m.id;
  const diffs = [
    before.status !== after.status && `${before.status} → ${after.status}`,
    before.start !== after.start && `${moment(before.start)} → ${moment(after.start)}`,
    before.durMin !== after.durMin && `${before.durMin} → ${after.durMin} min`,
    before.type !== after.type && `${before.type} → ${after.type}`,
  ].filter(Boolean);
  return `${after.type} ${day(after.start)} : ${diffs.length > 0 ? diffs.join(", ") : "étapes ou allures"} [${m.id}]`;
}

function runLine(stores: Stores, a: Activity): string {
  const pace = a.distM > 0 ? (a.durMin * 60_000) / a.distM : 0;
  const feel = a.feel ?? a.answeredFeel ?? "?";
  const session = a.sessionId ? stores.plannedSession.get(a.sessionId) : undefined;
  const matched = session ? `séance ${session.type} ${moment(session.start)}` : aside(stores, a, pace);
  return `${moment(a.start)}  ${clock(a.durMin)}  ${(a.distM / 1000).toFixed(2)} km  ${pace > 0 ? paceLabel(pace) : "?"}  FC ${a.avgHr ?? "?"}  ressenti ${feel}  ${matched}`;
}

/** Why a run counts for no session, and whether the level reads it at all. */
function aside(stores: Stores, a: Activity, paceSKm: number): string {
  if (paceSKm < PACE_BOUNDS_S_KM[0] || paceSKm > PACE_BOUNDS_S_KM[1])
    return "écartée : allure hors bornes (marche ou GPS)";
  const started = stores.program.get("current")?.value.startedOn;
  if (started && dateOf(a.start) < started) return "écartée : avant le programme";
  return "libre (aucune séance)";
}

function levelLines(stores: Stores, r: ReportRange): string[] {
  const estimates = stores.fitnessEstimate.list();
  const shown = estimates.filter((f) => f.date >= r.from && f.date <= r.to);
  const before = estimates.filter((f) => f.date < r.from).at(-1);
  const proposals = stores.proposal.list().filter((p) => p.status === "pending");
  return [
    ...[...(before ? [before] : []), ...shown].map(
      (f) => `${f.date}  VDOT ${f.vdot.toFixed(1)}  ${f.source}${f.provisional ? " (provisoire)" : ""}`,
    ),
    ...proposals.map((p) => `En attente : ${p.kind} ${p.from} → ${p.to} (${p.ruleId}), expire le ${p.expiresOn}`),
  ];
}

function chatLine(m: ChatMessage): string {
  const tags = m.widgets.map((w) => `[${w.type}]`).join(" ");
  return `${moment(paris(m.at))}  ${m.role === "anna" ? "Anna " : "Reggie"}  ${oneLine(m.text)}${tags ? `  ${tags}` : ""}`;
}

type Seen = {
  sessions: PlannedSession[];
  changes: ChangeEntry[];
  chat: ChatMessage[];
  incidents: { type: string; message: string; at: string }[];
};

function anomalies(stores: Stores, r: ReportRange, seen: Seen): string[] {
  return [
    ...seen.sessions
      .filter((s) => s.start > r.now && s.status !== "planned")
      .map((s) => `Séance à venir ${s.type} ${moment(s.start)} déjà « ${s.status} » [${s.id}]`),
    ...calendarClashes(stores, seen.sessions, r),
    ...threeInARow(
      seen.sessions,
      stores.activity.overlapping(`${addDays(r.from, -2)}T00:00`, `${addDays(r.to, 3)}T00:00`),
    ),
    ...chatAnomalies(seen.chat, r.now),
    ...seen.incidents
      .filter((i) => i.type === "slow")
      .map((i) => `Lenteur ${moment(paris(i.at))} : ${oneLine(i.message)}`),
    ...doneEarly(seen.changes),
    ...overG2(stores, seen.sessions),
  ];
}

/** H1: a session in a class or at work, buffers included (travel before, 30 min or travel after). */
function calendarClashes(stores: Stores, sessions: PlannedSession[], r: ReportRange): string[] {
  const travel = stores.profile.get("current")?.value.travelMin ?? 0;
  const events = stores.calendarEvent
    .overlapping(`${r.from}T00:00`, `${addDays(r.to, 1)}T00:00`)
    .filter((e) => (e.kind === "class" && !e.cancelled) || e.kind === "work")
    .flatMap((e) => occurrences(e, r.from, addDays(r.to, 1)));
  const after = (e: CalendarEvent) => (e.kind === "work" ? Math.max(AFTER_EVENT_MIN, travel) : AFTER_EVENT_MIN);
  return sessions
    .filter(active)
    .flatMap((s) =>
      events
        .filter((e) => s.start < addMinutes(e.end, after(e)) && addMinutes(end(s), travel) > e.start)
        .map(
          (e) =>
            `${s.type} ${moment(s.start)} (${s.durMin} min${s.manual ? ", manuelle" : ""}) touche ${e.kind === "work" ? "le travail" : "le cours"} « ${e.title} » ${e.start.slice(11)} à ${e.end.slice(11)}, trajet compris`,
        ),
    );
}

/** Three calendar days in a row with a run, planned or run. */
function threeInARow(sessions: PlannedSession[], runs: Activity[]): string[] {
  const days = new Set([...sessions.filter(active).map((s) => dateOf(s.start)), ...runs.map((a) => dateOf(a.start))]);
  return [...days]
    .sort()
    .filter((d) => days.has(addDays(d, 1)) && days.has(addDays(d, 2)) && !days.has(addDays(d, -1)))
    .map((d) => `Courses 3 jours de suite à partir du ${day(d)}`);
}

function chatAnomalies(chat: ChatMessage[], now: string): string[] {
  const found: string[] = [];
  chat.forEach((m, i) => {
    const next = chat[i + 1];
    const prev = chat[i - 1];
    if (prev && prev.role === m.role && prev.text === m.text && Date.parse(m.at) - Date.parse(prev.at) < DUPLICATE_MS)
      found.push(`Message en double ${moment(paris(m.at))} (${m.role}) : ${oneLine(m.text).slice(0, 60)}`);
    // The last of a burst only: Reggie answers several messages at once.
    const answered = next && (next.role === "reggie" || Date.parse(next.at) - Date.parse(m.at) < DUPLICATE_MS);
    if (m.role === "anna" && !answered && paris(m.at) < now)
      found.push(`Message d'Anna sans réponse ${moment(paris(m.at))} : ${oneLine(m.text).slice(0, 60)}`);
  });
  return found;
}

/** A session marked done before the hour it was planned at: a run that cannot have happened yet. */
function doneEarly(changes: ChangeEntry[]): string[] {
  return changes.flatMap((c) =>
    c.mutations
      .filter((m) => m.table === "planned_session")
      .flatMap((m) => {
        const before = asSession(m.before);
        const after = asSession(m.after);
        if (after?.status !== "done" || before?.status === "done" || paris(c.at) >= after.start) return [];
        return [`${after.type} ${moment(after.start)} marquée faite dès ${moment(paris(c.at))} [${after.id}]`];
      }),
  );
}

/** G2 on the planned week: its minutes against 1.10 × the best of the 4 weeks run before. Soft: a long run may pass. */
function overG2(stores: Stores, sessions: PlannedSession[]): string[] {
  const mondays = [...new Set(sessions.map((s) => mondayOf(dateOf(s.start))))];
  return mondays.flatMap((monday) => {
    const built = sessions
      .filter((s) => active(s) && mondayOf(dateOf(s.start)) === monday)
      .reduce((sum, s) => sum + s.durMin, 0);
    const weeks = Array.from({ length: CHRONIC_WEEKS }, (_, k) => addDays(monday, -7 * (k + 1))).map((m) =>
      stores.activity.overlapping(`${m}T00:00`, `${addDays(m, 7)}T00:00`).reduce((sum, a) => sum + a.durMin, 0),
    );
    const cap = WEEK_RISE * Math.max(...weeks);
    if (cap === 0 || built <= cap) return [];
    return [`Semaine ${isoWeekOf(monday)} : ${built} min prévues pour ${Math.round(cap)} au plus (G2, souple)`];
  });
}
