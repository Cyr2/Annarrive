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
  ProfilePatch,
  ProfileView,
  ProgramView,
  CalendarEvent as ServerEvent,
  ChatMessage as ServerMessage,
  Program as ServerProgram,
  Proposal as ServerProposal,
  Today as ServerToday,
  WatchStatus as ServerWatch,
  Week as ServerWeek,
  SessionView,
  TimetableStatus,
  Unavailable,
  UnavailablePreview,
  WatchInfo,
} from "@annarrive/protocol";
import { agreeWith, paceLabel, sessionNames, sessionTitle, sessionWhy, stepBlocks } from "@annarrive/protocol";
import {
  addDays,
  daysBetween,
  dayTitle,
  decimal,
  duration,
  longDate,
  minutesOf,
  mondayOf,
  relativeDay,
  timeOf,
  toIso,
  weekday,
} from "../lib/date.ts";
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
  StepLine,
  Strength,
  Today,
  WatchStatus,
  Week,
  WeekReview,
  Widget,
} from "./schemas.ts";

/** The one place where the server's shapes (packages/protocol) become what the screens show, and back. */

type RunType = PlannedSession["type"];

const TITLES = sessionNames;

const WATCH: Record<ServerWatch, WatchStatus> = { pending: "sending", sent: "synced", failed: "failed", off: "off" };
/** As a Garmin workout names its steps; a work step is named by its length alone (« 8 min »). */
const STEP_LABELS: Record<ServerStep["kind"], string | undefined> = {
  warmup: "Échauffement",
  work: undefined,
  recover: "Récupérer",
  cooldown: "Retour au calme",
  strides: "Accélération",
};
const EVENT_KINDS: Record<ServerEvent["kind"], EventKind> = {
  class: "class",
  exam: "class",
  strength: "strength",
  revision: "revision",
  unavailable: "busy",
  work: "work",
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
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** "07:30" and "2026-11-16T07:30" both give "7:30", the screens' clock. */
export const clockOf = (at: string) => timeOf(minutesOf(at.length > 5 ? at.slice(11, 16) : at));
const fullClock = (clock: string) => clock.padStart(5, "0");
export const localAt = (date: string, clock: string) => `${date}T${fullClock(clock)}`;

function intensityOf(type: RunType): Intensity {
  if (type === "L") return "long";
  return type === "E" || type === "RECUP" ? "easy" : "hard";
}

type ServerStep = PlannedSession["steps"][number];

/** "20 s", "1 min 30", "45 min", "1 h 06": a step under a minute never reads "0 min". */
export function stepDuration(minutes: number): string {
  const seconds = Math.round(minutes * 60);
  if (seconds < 60) return `${seconds} s`;
  const whole = Math.floor(seconds / 60);
  return seconds % 60 === 0 || whole >= 60 ? duration(Math.round(seconds / 60)) : `${whole} min ${seconds % 60}`;
}

/** One pass: "800 m", "8 min", "10 s". */
function size(step: ServerStep): string {
  const metres = step.distM ?? 0;
  const one = metres
    ? metres >= 1000
      ? `${decimal(metres / 1000)} km`
      : `${metres} m`
    : step.durMin
      ? stepDuration(step.durMin)
      : "";
  return one;
}

/** The main set as the card names it: "6 × 800 m". */
function amount(step: ServerStep): string {
  return step.reps && step.reps > 1 ? `${step.reps} × ${size(step)}` : size(step);
}

/** The steady easy part of a run is drawn plain, so a long run with a faster block shows its shape. */
function toneOf(step: ServerStep): StepLine["tone"] {
  if (step.kind === "recover") return "muted";
  if (step.kind === "strides") return "hard";
  return step.kind === "work" && step.zone !== "E" ? "hard" : "plain";
}

/** In a footing, the easy part before the strides is the footing itself, not a warm-up (G5). */
function labelOf(step: ServerStep, footing: boolean): string | undefined {
  const easy = step.kind === "warmup" || (step.kind === "work" && step.zone === "E");
  return footing && easy ? "Footing" : STEP_LABELS[step.kind];
}

function toLine(step: ServerStep, footing = false): StepLine {
  const { paceSKm } = step.target;
  return {
    label: [labelOf(step, footing), size(step)].filter(Boolean).join(" · "),
    pace: paceSKm ? paceLabel(paceSKm) : "",
    tone: toneOf(step),
    ...(step.durMin ? { minutes: step.durMin } : {}),
  };
}

/** The steps as the watch gets them (`stepBlocks`): lines, and « Répéter n fois » groups. */
export function toSteps(steps: ServerStep[], footing = false): Step[] {
  const line = (step: ServerStep) => toLine(step, footing);
  return stepBlocks(steps).map((b) =>
    b.kind === "step" ? line(b.step) : { repeat: b.times, steps: b.steps.map(line) },
  );
}

/** « 6 × 800 m »; a footing's strides say what they are: « 6 accélérations de 10 s ». */
function mainSetOf(session: SessionView | PlannedSession, work: ServerStep | undefined): string | undefined {
  const strides = session.steps.find((s) => s.kind === "strides");
  if (session.type === "E" && strides) return `${strides.reps ?? 1} accélérations de ${size(strides)}`;
  const main = work ?? strides;
  return main?.reps ? amount(main) : undefined;
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
    title: sessionTitle(session),
    intensity: intensityOf(session.type),
    mainSet: mainSetOf(session, work),
    pace: paced ? paceLabel(paced) : "",
    steps: toSteps(session.steps, session.type === "E"),
    why: sessionWhy(session),
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

type Plan = NonNullable<ProgramView["plan"]>;

const PHASES: Record<Plan["phases"][number]["phase"], string> = {
  base: "Base",
  dev: "Développement",
  spe: "Spécifique",
  taper: "Affûtage",
};
const TARGET_TAGS = { atteignable: "reachable", ambitieux: "ambitious" } as const;

/** The plan week of `monday`, from 1; the week the programme starts in is filled with week 1, as the coach does. */
export function planWeek(plan: Plan | undefined, monday: string): { index: number; total: number } | undefined {
  if (!plan) return undefined;
  const total = plan.phases.reduce((sum, p) => sum + p.weeks, 0);
  const index = Math.floor(daysBetween(plan.firstMonday, monday) / 7) + 1;
  return index >= 0 && index <= total ? { index: Math.max(1, index), total } : undefined;
}

/** `timetable`: undefined when the server could not say (the line then says it is unreachable). */
export function toWeek(
  week: ServerWeek,
  monday: string,
  timetable: TimetableStatus | undefined,
  today: string,
  plan?: Plan,
): Week {
  const change = timetable?.lastChange;
  return {
    monday,
    ...planWeek(plan, monday),
    readOnly: week.readOnly,
    timetableCheckedAt: timetable ? (timetable.lastSyncAt ?? "") : undefined,
    // What the last read changed stays written the day it happened, even when it ran in the background.
    ...(change && toIso(new Date(change.at)) === today ? { timetableChange: change.summary } : {}),
    items: toItems(week.days),
  };
}

function raceOf(distanceM: number): string {
  return RACES.get(distanceM) ?? `${decimal(distanceM / 1000)} km`;
}

export function toProposal(proposal: ServerProposal): Proposal {
  if (proposal.kind === "test")
    return { id: proposal.id, text: "Je te propose un test de forme pour régler tes allures." };
  if (proposal.kind === "goal")
    return {
      id: proposal.id,
      text: "Tes dernières courses donnent un autre chrono pour ton objectif. Je te propose de l'ajuster, ou tu gardes le tien.",
    };
  const proof = proposal.proof;
  if (proof && proposal.to > proposal.from)
    return {
      id: proposal.id,
      text: `Ton ${Math.round(proof.distanceM / 1000)} km du ${longDate(proof.date)} montre que tu vas plus vite que tes allures : je te propose de les relever, seuil à ${paceLabel(proof.thresholdSKm)}.`,
    };
  return {
    id: proposal.id,
    text:
      proposal.to > proposal.from
        ? "Tes dernières séances rapides sont bien passées : je te propose des allures un peu plus vives."
        : "Tes dernières séances rapides ont été dures : je te propose des allures un peu plus douces.",
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

/** Under this share of the planned time, the run was cut short: no check as for a session done as planned. */
const CUT_SHARE = 0.8;

/** After the run: what Garmin sent, against the session it matched when there is one. */
export function toActivity(run: ActivityView, session: SessionView | null): Activity {
  const planned = session && run.sessionId === session.id ? session : null;
  const paceS = run.distM > 0 ? (run.durMin * 60_000) / run.distM : 0;
  return {
    id: run.id,
    title: planned ? `${TITLES[planned.type]} ${agreeWith(planned.type, "fait")}` : "Course libre",
    receivedAt: clockOf(run.start),
    distanceKm: Math.round(run.distM / 100) / 10,
    duration: clockDuration(run.durMin),
    mainPaceLabel: "Allure moyenne",
    mainPace: paceS ? paceLabel(paceS) : "",
    verdict: planned
      ? `Prévu ${duration(Math.round(planned.durMin))}, fait en ${duration(Math.round(run.durMin))}`
      : "Course en plus, je la compte dans ta semaine.",
    cut: planned !== null && run.durMin < CUT_SHARE * planned.durMin,
    askFeel: run.feel === undefined,
    intensity: planned ? intensityOf(planned.type) : undefined,
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
    // ISO strings sort as text; localeCompare would load the collator at boot, on the first screen's path.
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))[0];
  return {
    date: today.date,
    goal: goal
      ? {
          label: goal.name ?? (goal.distanceM === 21097.5 ? "Semi" : raceOf(goal.distanceM)),
          daysLeft: daysBetween(today.date, goal.date),
        }
      : undefined,
    session: today.session && shown(today.session) ? { ...toRun(today.session), lightened: today.note } : undefined,
    // A morning jog does not hide the evening session still ahead.
    activity:
      today.activity && (today.session?.status !== "planned" || today.activity.sessionId === today.session.id)
        ? toActivity(today.activity, today.session)
        : undefined,
    next: next && toRun(next),
    proposals: proposals.map(toProposal),
    unwell: ["sick", "cold", "pain"].includes(today.health.kind),
    unwellText: UNWELL[today.health.kind],
    toConfirm: today.toConfirm ? toRun(today.toConfirm) : undefined,
    adapted: today.adapted,
    review: today.review && toReview(today.review, days),
    race: today.race && {
      ...today.race,
      race: raceOf(today.race.distanceM),
      name: today.race.name,
      distanceKm: today.race.distanceM / 1000,
    },
  };
}

/** The review as Aujourd'hui shows it, with the runs of the week after the one reviewed. */
function toReview(review: NonNullable<ServerToday["review"]>, days: DayView[]): WeekReview {
  const from = addDays(review.monday, 7);
  const to = addDays(from, 7);
  const { highlight, ...facts } = review;
  return {
    ...facts,
    highlight: highlight && {
      text: highlight.text,
      intensity: highlight.type && intensityOf(highlight.type),
    },
    next: days
      .filter((d) => d.date >= from && d.date < to)
      .flatMap((d) => d.sessions)
      .filter((s) => s.status !== "cancelled" && s.status !== "skipped")
      .map(toRun),
  };
}

/** Aujourd'hui says she is unwell as long as she is, with « Ça va mieux » next to it. */
const UNWELL: Partial<Record<ServerToday["health"]["kind"], string>> = {
  sick: "Tu as de la fièvre : repos conseillé, footing court si tu cours.",
  cold: "Tu es enrhumée : footings courts et tranquilles.",
  pain: "Tu as mal : footings tranquilles, pas de fractionné.",
};

export function toSettings(profile: ProfileView): Settings {
  return {
    runsPerWeek: profile.runsPerWeek,
    noRunDays: profile.noRunDays.map((d) => d - 1),
    notBefore: clockOf(profile.earliest),
    notAfter: clockOf(profile.latestEnd),
    bedtime: clockOf(profile.bedtime),
    recoveryData: profile.useSleepHr,
    travelMin: profile.travelMin,
    preferredHour: profile.preferredHour && clockOf(profile.preferredHour),
    usualHour: profile.usualHour && clockOf(profile.usualHour),
    longRunDays: (profile.preferredLongDays ?? [7]).map((d) => d - 1),
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
  if (patch.travelMin !== undefined) out.travelMin = patch.travelMin;
  // Asked for and left empty: back to automatic.
  if ("preferredHour" in patch) out.preferredHour = patch.preferredHour ? fullClock(patch.preferredHour) : null;
  if (patch.longRunDays?.length) out.preferredLongDays = patch.longRunDays.map((d) => d + 1).sort((a, b) => a - b);
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
  return {
    distanceM,
    date: goal.date,
    targetMin: targetMin > 0 ? targetMin : undefined,
    startTime: goal.startTime ? fullClock(goal.startTime) : undefined,
    name: goal.name,
  };
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
  program: ProgramView;
  profile: ProfileView;
  /** Undefined when the server could not say (see toWeek). */
  lastSyncAt: string | null | undefined;
  days: DayView[];
  today: string;
  /** Undefined when the server could not say: the watch's state is then unknown. */
  watch: WatchInfo | undefined;
};

export function toProgram({ program, profile, lastSyncAt, days, today, watch }: ProgramParts): Program {
  const { goal, plan } = program;
  // Before or after the plan, no week is current and no "Semaine X sur Y" is shown.
  const current = planWeek(plan, mondayOf(today));
  return {
    goal: goal
      ? {
          race: raceOf(goal.distanceM),
          distanceKm: goal.distanceM / 1000,
          date: goal.date,
          targetTime: goal.targetMin ? targetTime(goal.targetMin) : undefined,
          startTime: goal.startTime && clockOf(goal.startTime),
          name: goal.name,
          targetTag: plan?.verdict && TARGET_TAGS[plan.verdict],
          targetWhy: plan?.odds,
        }
      : // Maintenance: "Choisir un objectif" starts from a half marathon in 12 weeks.
        { race: "Semi-marathon", distanceKm: 21.1, date: today },
    phases: (plan?.phases ?? []).filter((p) => p.weeks > 0).map((p) => ({ name: PHASES[p.phase], weeks: p.weeks })),
    weekIndex: current?.index ?? 0,
    weekTotal: current?.total ?? 0,
    phaseNote: "",
    maintenance: !goal,
    settings: toSettings(profile),
    strength: toStrength(days),
    timetableCheckedAt: lastSyncAt === undefined ? undefined : (lastSyncAt ?? ""),
    timetableUrl: profile.icsUrl,
    lastTime: program.declaredTime,
    watch: {
      model: "vivoactive 4",
      connected: watch?.configured && !days.some((d) => d.sessions.some((s) => s.watch === "failed")),
      lastSync: watch?.lastSyncAt ?? undefined,
    },
  };
}

/** The banner's one line: the change and its first warning; the others are counted, never listed (audit N-G1). */
export function changeMessage(summary: string, warnings: string[]): string {
  const [first, ...rest] = warnings;
  const more = rest.length === 0 ? undefined : rest.length === 1 ? "1 autre point" : `${rest.length} autres points`;
  return [summary, first, more].filter(Boolean).join(" · ");
}

export function toChange(response: ChangeResponse): ChangeResult {
  const summary = response.change?.summary ?? "Rien n'a changé";
  return { changeId: response.change?.id ?? "", message: changeMessage(summary, response.warnings), rows: [] };
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
    until: event.until,
    exceptions: event.exceptions,
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
      why: capitalize(b.reason),
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
  return [duration(run.durationMin), run.pace].filter(Boolean).join(" · ");
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

function toWidget(widget: ChatWidget, question: string): Widget | undefined {
  switch (widget.type) {
    case "choices":
      // The question itself names the buttons for VoiceOver: every answer group is not just « Ta réponse ».
      return { type: "choices", label: question || "Ta réponse", options: widget.options };
    case "slider":
      return { type: "scale", label: widget.label };
    case "slots":
      return {
        type: "slots",
        sessionId: widget.sessionId,
        slots: widget.slots.map((s) => ({
          date: dateOf(s.slot.start),
          start: clockOf(s.slot.start),
          why: capitalize(s.reason),
          consequence: "",
        })),
      };
    case "session_preview":
      return {
        type: "preview",
        sessionId: widget.sessionId,
        optionId: widget.option === "jog30" ? "jog" : widget.option,
        session: {
          title: sessionTitle(widget.session),
          detail: detail(widget.session),
          intensity: intensityOf(widget.session.type),
        },
        alternative: "Garder la séance prévue",
      };
    case "session_request":
      // The session Anna asked for (algo.md M14): its day and hour matter as much as its content.
      return {
        type: "preview",
        sessionId: widget.session.id,
        session: {
          title: sessionTitle(widget.session),
          detail: `${dayTitle(dateOf(widget.session.start))} · ${clockOf(widget.session.start)} · ${detail(widget.session)}`,
          intensity: intensityOf(widget.session.type),
        },
        alternative: "Non merci",
      };
    case "change":
      return {
        type: "change",
        change: { changeId: widget.changeId, message: changeMessage(widget.summary, widget.warnings), rows: [] },
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
    case "retract":
      // An empty draft shows no bubble: the dots come back until the real answer.
      draft.text = "";
      return [
        { type: "message", message: { id: draft.id, role: "reggie", text: "" } },
        { type: "status", status: "thinking" },
      ];
    case "done":
      return toMessages({ ...event.message, id: draft.id }).map((message) => ({ type: "message", message }));
    case "error":
      // 503: Reggie is off, the chat offers no Réessayer (features/reggie/store.ts).
      throw new ApiError(event.retry === false ? 503 : 502, event.error);
  }
}

/** One screen message per widget, the text on the first, so each widget keeps its own answer. */
export function toMessages(message: ServerMessage): ChatMessage[] {
  const role = message.role === "anna" ? "user" : "reggie";
  const widgets = message.widgets.flatMap((w) => toWidget(w, message.text) ?? []);
  if (widgets.length === 0) return [{ id: message.id, role, text: message.text }];
  return widgets.map((widget, i) => ({
    id: i === 0 ? message.id : `${message.id}-${i}`,
    role,
    text: i === 0 ? message.text : "",
    widget,
  }));
}
