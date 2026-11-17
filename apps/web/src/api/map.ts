import type {
  ActivityView,
  ChangeOptions,
  ChangeResponse,
  ChatStreamEvent,
  ChatWidget,
  CreateEventInput,
  DayView,
  MoveSlots,
  PainSite,
  PlannedSession,
  Profile,
  ProfilePatch,
  CalendarEvent as ServerEvent,
  ChatMessage as ServerMessage,
  Program as ServerProgram,
  Proposal as ServerProposal,
  Today as ServerToday,
  WatchStatus as ServerWatch,
  Week as ServerWeek,
  SessionView,
  Unavailable,
  UnavailablePreview,
  WatchInfo,
} from "@annarrive/protocol";
import { daysBetween, decimal, duration, minutesOf, relativeDay, timeOf, weekday } from "../lib/date.ts";
import type { GoalInput, NewEvent, UnavailableInput } from "./client.ts";
import { ApiError } from "./errors.ts";
import type {
  Activity,
  CalendarEvent,
  ChangeOption,
  ChangeResult,
  ChangeRow,
  ChatEvent,
  ChatMessage,
  EventKind,
  Feel,
  Intensity,
  Item,
  MoveOptions,
  Program,
  Proposal,
  Repeat,
  Run,
  Settings,
  Step,
  Strength,
  Today,
  WatchStatus,
  Week,
  Widget,
} from "./schemas.ts";

/** The one place where the server's shapes (packages/protocol) become what the screens show, and back. */

type RunType = PlannedSession["type"];

const TITLES: Record<RunType, string> = {
  E: "Footing",
  RECUP: "Footing de récupération",
  L: "Sortie longue",
  T: "Seuil",
  CRUISE: "Seuil en fractions",
  I: "Fractionné",
  R: "Vitesse",
  SPE: "Allure course",
  COTES_C: "Côtes courtes",
  COTES_L: "Côtes longues",
  FARTLEK: "Fartlek",
  TEST: "Test",
};

const WHY: Record<RunType, string> = {
  E: "Endurance fondamentale : elle construit ta base sans te fatiguer.",
  RECUP: "Garde les jambes en mouvement pour récupérer de la séance d'avant.",
  L: "Habitue ton corps à durer, à allure facile.",
  T: "Repousse ton seuil : tenir plus longtemps une allure soutenue.",
  CRUISE: "Le seuil en fractions : le même effet que le seuil, plus facile à tenir.",
  I: "Des fractions intenses pour faire monter ta VO2max.",
  R: "Des fractions très courtes pour ta vitesse et ta foulée.",
  SPE: "Tu répètes l'allure de ta course.",
  COTES_C: "La côte renforce tes jambes et ta foulée.",
  COTES_L: "De longues montées pour ton endurance et ta force.",
  FARTLEK: "Des changements d'allure au ressenti.",
  TEST: "Mesure ta forme pour ajuster tes allures.",
};

const WATCH: Record<ServerWatch, WatchStatus> = { pending: "sending", sent: "synced", failed: "failed" };
const STEP_LABELS: Record<ServerStep["kind"], string> = {
  warmup: "Échauffement",
  work: "Bloc",
  recover: "Récupération",
  cooldown: "Retour au calme",
  strides: "Accélérations",
};
const EVENT_KINDS: Record<ServerEvent["kind"], EventKind> = {
  class: "class",
  exam: "class",
  strength: "strength",
  revision: "revision",
  unavailable: "busy",
};
const REPEATS: Record<Repeat, ServerEvent["recurrence"]> = { never: "none", weekly: "weekly", biweekly: "biweekly" };
const RACES = new Map([
  [5000, "5 km"],
  [10000, "10 km"],
  [21097.5, "Semi-marathon"],
  [42195, "Marathon"],
]);
const DISTANCES = [5000, 10000, 21097.5, 42195] as const;

export const dateOf = (at: string) => at.slice(0, 10);
/** "07:30" and "2026-11-16T07:30" both give "7:30", the screens' clock. */
export const clockOf = (at: string) => timeOf(minutesOf(at.length > 5 ? at.slice(11, 16) : at));
const fullClock = (clock: string) => clock.padStart(5, "0");
export const localAt = (date: string, clock: string) => `${date}T${fullClock(clock)}`;

function intensityOf(type: RunType): Intensity {
  if (type === "L") return "long";
  return type === "E" || type === "RECUP" ? "easy" : "hard";
}

function paceText([a, b]: [number, number]): string {
  const one = (s: number) => {
    const total = Math.round(s);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  };
  const [fast, slow] = [Math.min(a, b), Math.max(a, b)];
  return one(fast) === one(slow) ? one(fast) : `${one(fast)} à ${one(slow)}`;
}

type ServerStep = PlannedSession["steps"][number];

function amount(step: ServerStep): string {
  const metres = step.distM ?? 0;
  const size = metres
    ? metres >= 1000
      ? `${decimal(metres / 1000)} km`
      : `${metres} m`
    : step.durMin
      ? duration(Math.round(step.durMin))
      : "";
  return step.reps && step.reps > 1 ? `${step.reps} × ${size}` : size;
}

function toStep(step: ServerStep): Step {
  const size = amount(step);
  const { paceSKm, rpe } = step.target;
  return {
    label: step.kind === "work" && size ? size : [STEP_LABELS[step.kind], size].filter(Boolean).join(" "),
    pace: paceSKm ? paceText(paceSKm) : rpe ? `Ressenti ${rpe}/10` : "",
    tone: step.kind === "work" || step.kind === "strides" ? "hard" : step.kind === "recover" ? "muted" : "plain",
  };
}

export function toRun(session: SessionView | PlannedSession): Run {
  const work = session.steps.find((s) => s.kind === "work");
  const paced = work?.target.paceSKm ?? session.steps.find((s) => s.target.paceSKm)?.target.paceSKm;
  const watch = "watch" in session && session.watch ? WATCH[session.watch] : undefined;
  return {
    id: session.id,
    kind: "run",
    date: dateOf(session.start),
    start: clockOf(session.start),
    durationMin: Math.max(1, Math.round(session.durMin)),
    title: TITLES[session.type],
    intensity: intensityOf(session.type),
    mainSet: work?.reps ? amount(work) : undefined,
    pace: paced ? paceText(paced) : "",
    steps: session.steps.map(toStep),
    why: WHY[session.type],
    watch,
  };
}

export function toEvent(event: ServerEvent, date: string): CalendarEvent {
  return {
    id: event.id,
    kind: EVENT_KINDS[event.kind],
    date,
    start: clockOf(event.start),
    end: clockOf(event.end),
    title: event.title,
    legs: event.legs,
    cancelled: event.cancelled,
    // A strength session is one recurring event: its id is the template the sheets edit.
    templateId: event.kind === "strength" ? event.id : undefined,
  };
}

const shown = (s: SessionView) => s.status !== "cancelled" && s.status !== "skipped";

export function toItems(days: DayView[]): Item[] {
  return days.flatMap((day) => [
    ...day.sessions.filter(shown).map(toRun),
    ...day.events.map((event) => toEvent(event, day.date)),
  ]);
}

export function toWeek(week: ServerWeek, monday: string, lastSyncAt: string | null): Week {
  return { monday, readOnly: week.readOnly, timetableCheckedAt: lastSyncAt ?? "", items: toItems(week.days) };
}

function raceOf(distanceM: number): string {
  return RACES.get(distanceM) ?? `${decimal(distanceM / 1000)} km`;
}

export function toProposal(proposal: ServerProposal): Proposal {
  if (proposal.kind === "test") return { id: proposal.id, text: "Je propose un test pour recaler tes allures." };
  if (proposal.kind === "goal")
    return { id: proposal.id, text: "Ton chrono visé semble à revoir : je propose de l'ajuster." };
  return {
    id: proposal.id,
    text:
      proposal.to > proposal.from
        ? "Tes dernières séances clés sont bien passées : je propose des allures un peu plus rapides."
        : "Tes dernières séances clés ont été dures : je propose des allures un peu plus faciles.",
  };
}

const FEELS: Record<NonNullable<ActivityView["feel"]>, Feel> = { easy: "easy", ok: "fine", hard: "hard" };
export const toServerFeel = (feel: Feel) => (feel === "fine" ? "ok" : feel);

/** "51:12", "1:02:05". */
function clockDuration(minutes: number): string {
  const total = Math.round(minutes * 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  const [h, m, s] = [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60];
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** After the run: what Garmin sent, against the session it matched when there is one. */
export function toActivity(run: ActivityView, session: SessionView | null): Activity {
  const planned = session && run.sessionId === session.id ? session : null;
  const paceS = run.distM > 0 ? (run.durMin * 60_000) / run.distM : 0;
  return {
    id: run.id,
    title: planned ? TITLES[planned.type] : "Course libre",
    receivedAt: clockOf(run.start),
    distanceKm: Math.round(run.distM / 100) / 10,
    duration: clockDuration(run.durMin),
    mainPaceLabel: "Allure moyenne",
    mainPace: paceS ? paceText([paceS, paceS]) : "",
    verdict: planned
      ? `Prévu ${duration(Math.round(planned.durMin))}, fait en ${duration(Math.round(run.durMin))}`
      : "Hors programme, comptée dans ton volume",
    askFeel: run.feel === undefined,
    feel: run.answeredFeel && FEELS[run.answeredFeel],
  };
}

export function toToday(
  today: ServerToday,
  program: ServerProgram,
  days: DayView[],
  proposals: ServerProposal[] = [],
): Today {
  const { goal } = program;
  const next = days
    .flatMap((d) => d.sessions)
    .filter((s) => s.status === "planned" && dateOf(s.start) > today.date)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  return {
    date: today.date,
    goal: goal
      ? {
          label: goal.distanceM === 21097.5 ? "Semi" : raceOf(goal.distanceM),
          daysLeft: daysBetween(today.date, goal.date),
        }
      : undefined,
    session: today.session && shown(today.session) ? toRun(today.session) : undefined,
    // A morning jog does not hide the evening session still ahead.
    activity:
      today.activity && (today.session?.status !== "planned" || today.activity.sessionId === today.session.id)
        ? toActivity(today.activity, today.session)
        : undefined,
    next: next && toRun(next),
    proposals: proposals.map(toProposal),
    unwell: ["sick", "cold", "pain"].includes(today.health.kind),
  };
}

export function toSettings(profile: Profile): Settings {
  return {
    runsPerWeek: profile.runsPerWeek,
    noRunDays: profile.noRunDays.map((d) => d - 1),
    notBefore: clockOf(profile.earliest),
    notAfter: clockOf(profile.latestEnd),
    bedtime: clockOf(profile.bedtime),
    recoveryData: profile.useSleepHr,
    cycle: profile.cycleTracking,
    // The switch reads the browser's subscription, not the profile.
    notifications: false,
  };
}

function runsPerWeek(count: number): 3 | 4 | 5 {
  if (count === 3 || count === 4 || count === 5) return count;
  throw new ApiError(400, "Choisis entre 3 et 5 courses par semaine.");
}

export function toProfilePatch(patch: Partial<Settings>): ProfilePatch {
  const out: ProfilePatch = {};
  if (patch.runsPerWeek !== undefined) out.runsPerWeek = runsPerWeek(patch.runsPerWeek);
  if (patch.noRunDays) out.noRunDays = patch.noRunDays.map((d) => d + 1);
  if (patch.notBefore) out.earliest = fullClock(patch.notBefore);
  if (patch.notAfter) out.latestEnd = fullClock(patch.notAfter);
  if (patch.bedtime) out.bedtime = fullClock(patch.bedtime);
  if (patch.recoveryData !== undefined) out.useSleepHr = patch.recoveryData;
  if (patch.cycle !== undefined) out.cycleTracking = patch.cycle;
  return out;
}

function targetTime(minutes: number): string {
  const seconds = Math.round(minutes * 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(seconds / 3600)}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
}

export function toGoal(goal: GoalInput): NonNullable<ServerProgram["goal"]> {
  const metres = goal.distanceKm * 1000;
  const distanceM = DISTANCES.reduce((best, d) => (Math.abs(d - metres) < Math.abs(best - metres) ? d : best));
  const parts = goal.targetTime?.split(":").map(Number) ?? [];
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  // "1:48" is read as hours and minutes, "1:48:00" as hours, minutes and seconds.
  const targetMin = parts.length === 2 ? seconds : seconds / 60;
  return { distanceM, date: goal.date, targetMin: targetMin > 0 ? targetMin : undefined };
}

/** Strength sessions are recurring events: each one seen this week or the next is a template. */
function toStrength(days: DayView[]): Strength[] {
  const seen = new Map<string, Strength>();
  for (const day of days) {
    for (const e of day.events.filter((e) => e.kind === "strength" && !seen.has(e.id))) {
      seen.set(e.id, {
        id: e.id,
        name: e.title,
        legs: e.legs ?? false,
        weekday: weekday(day.date),
        start: clockOf(e.start),
        durationMin: minutesOf(clockOf(e.end)) - minutesOf(clockOf(e.start)),
        repeat: e.recurrence === "none" ? "never" : e.recurrence,
        placed: true,
      });
    }
  }
  return [...seen.values()];
}

export type ProgramParts = {
  program: ServerProgram;
  profile: Profile;
  lastSyncAt: string | null;
  days: DayView[];
  today: string;
  watch: WatchInfo;
};

export function toProgram({ program, profile, lastSyncAt, days, today, watch }: ProgramParts): Program {
  const { goal } = program;
  return {
    goal: goal
      ? {
          race: raceOf(goal.distanceM),
          distanceKm: goal.distanceM / 1000,
          date: goal.date,
          targetTime: goal.targetMin ? targetTime(goal.targetMin) : undefined,
        }
      : // Maintenance: "Choisir un objectif" starts from a half marathon in 12 weeks.
        { race: "Semi-marathon", distanceKm: 21.1, date: today },
    phases: [],
    weekIndex: 0,
    weekTotal: 0,
    phaseNote: "",
    maintenance: !goal,
    settings: toSettings(profile),
    strength: toStrength(days),
    timetableCheckedAt: lastSyncAt ?? "",
    timetableUrl: profile.icsUrl,
    watch: {
      model: "Garmin vivoactive 4",
      connected: watch.configured && !days.some((d) => d.sessions.some((s) => s.watch === "failed")),
      lastSync: watch.lastSyncAt ?? undefined,
    },
  };
}

export function toChange(response: ChangeResponse): ChangeResult {
  const summary = response.change?.summary ?? "Rien n'a changé";
  return { changeId: response.change?.id ?? "", message: [summary, ...response.warnings].join(" · "), rows: [] };
}

export function toEventInput(event: NewEvent): CreateEventInput {
  if (event.kind === "class")
    throw new ApiError(400, "Un cours vient de ton emploi du temps : il ne s'ajoute pas ici.");
  return {
    kind: event.kind === "busy" ? "unavailable" : event.kind,
    title: event.title,
    start: localAt(event.date, event.start),
    end: localAt(event.date, event.end),
    legs: event.legs,
    recurrence: REPEATS[event.repeat ?? "never"],
  };
}

export const toRecurrence = (repeat: Repeat) => REPEATS[repeat];

export function toMoveOptions(slots: MoveSlots): MoveOptions {
  const consequence = slots.sideEffects.join(" · ");
  const open = new Set(slots.best.map((b) => dateOf(b.slot.start)));
  const blocked = new Map<string, string>();
  for (const f of slots.forbidden) {
    const date = dateOf(f.slot.start);
    if (!open.has(date) && !blocked.has(date)) blocked.set(date, f.reason);
  }
  return {
    slots: slots.best.map((b) => ({
      date: dateOf(b.slot.start),
      start: clockOf(b.slot.start),
      why: b.reason,
      consequence,
    })),
    blocked: [...blocked].map(([date, reason]) => ({ date, reason })),
  };
}

const OPTION_TITLES: Record<ChangeOption["id"], string> = {
  shorter: "Plus court",
  easier: "Plus facile",
  equivalent: "Autre séance équivalente",
  jog: "Footing tranquille",
};
const OPTION_IDS = ["shorter", "easier", "equivalent", "jog"] as const;

function detail(session: PlannedSession): string {
  const run = toRun(session);
  return [duration(run.durationMin), run.pace && `${run.pace} /km`].filter(Boolean).join(" · ");
}

export function toChangeOptions(options: ChangeOptions): ChangeOption[] {
  const sessions = {
    shorter: options.shorter,
    easier: options.easier,
    equivalent: options.equivalent,
    jog: options.jog30,
  };
  return OPTION_IDS.flatMap((id) => {
    const session = sessions[id];
    return session
      ? [{ id, title: OPTION_TITLES[id], detail: detail(session), intensity: intensityOf(session.type) }]
      : [];
  });
}

const PAIN_SITES: Record<string, PainSite> = {
  mollet: "mollet",
  genou: "genou",
  cheville: "cheville",
  hanche: "hanche",
  pied: "pied",
};

export function toUnavailable(input: UnavailableInput): Unavailable {
  const until = input.until ? { until: input.until } : {};
  if (input.reason === "sick") return { reason: "sick", feverOrChest: input.fever ?? false, ...until };
  if (input.reason === "pain") {
    const where = PAIN_SITES[input.zone?.toLowerCase() ?? ""] ?? "autre";
    return { reason: "pain", where, walking0to10: input.pain ?? 0, ...until };
  }
  return { reason: "tired", ...until };
}

/** Pas dispo's summary from the server's dry run: each changed day as it would be, then Reggie's advice. */
export function toPreviewRows(preview: UnavailablePreview, today: string): ChangeRow[] {
  return [
    ...preview.days.map(({ date, before, after }): ChangeRow => {
      const day = relativeDay(date, today);
      const was = before ? `${TITLES[before.type]} · ${detail(before)}` : undefined;
      if (!after) return { day, label: "Repos", tone: "rest", before: was };
      return { day, label: `${TITLES[after.type]} · ${detail(after)}`, tone: intensityOf(after.type), before: was };
    }),
    ...preview.warnings.map((label): ChangeRow => ({ day: "Conseil", label, tone: "other" })),
  ];
}

function toWidget(widget: ChatWidget): Widget | undefined {
  switch (widget.type) {
    case "choices":
      return { type: "choices", label: "Ta réponse", options: widget.options };
    case "slider":
      return { type: "scale", label: widget.label };
    case "slots":
      return {
        type: "slots",
        sessionId: widget.sessionId,
        slots: widget.slots.map((s) => ({
          date: dateOf(s.slot.start),
          start: clockOf(s.slot.start),
          why: s.reason,
          consequence: "",
        })),
      };
    case "session_preview":
      return {
        type: "preview",
        sessionId: widget.sessionId,
        optionId: widget.option === "jog30" ? "jog" : widget.option,
        session: {
          title: TITLES[widget.session.type],
          detail: detail(widget.session),
          intensity: intensityOf(widget.session.type),
        },
        alternative: "Garder la séance prévue",
      };
    case "change":
      return {
        type: "change",
        change: { changeId: widget.changeId, message: [widget.summary, ...widget.warnings].join(" · "), rows: [] },
      };
    default:
      // "checking" only says Reggie is searching: the stream turns it into a status.
      return undefined;
  }
}

/**
 * One event of the `POST /api/chat` stream as the screen shows it. `draft` gathers the text so far: the final
 * message reuses its id, so it replaces the streamed text on screen.
 */
export function toChatEvents(event: ChatStreamEvent, draft: { id: string; text: string }): ChatEvent[] {
  switch (event.type) {
    case "typing":
      return [{ type: "status", status: "thinking" }];
    case "widget":
      return event.widget.type === "checking" ? [{ type: "status", status: "searching" }] : [];
    case "text":
      draft.text += event.delta;
      return [{ type: "message", message: { id: draft.id, role: "reggie", text: draft.text } }];
    case "done":
      return toMessages({ ...event.message, id: draft.id }).map((message) => ({ type: "message", message }));
    case "error":
      throw new ApiError(502, event.error);
  }
}

/** One screen message per widget, the text on the first, so each widget keeps its own answer. */
export function toMessages(message: ServerMessage): ChatMessage[] {
  const role = message.role === "anna" ? "user" : "reggie";
  const widgets = message.widgets.flatMap((w) => toWidget(w) ?? []);
  if (widgets.length === 0) return [{ id: message.id, role, text: message.text }];
  return widgets.map((widget, i) => ({
    id: i === 0 ? message.id : `${message.id}-${i}`,
    role,
    text: i === 0 ? message.text : "",
    widget,
  }));
}
