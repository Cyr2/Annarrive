import { FAST_RATIO } from "./adaptation.ts";
import { isHard } from "./catalog.ts";
import { DAY_NAMES, dateOf, weekday } from "./dates.ts";
import { recoveryText } from "./maintenance.ts";
import type { Activity, Goal, RunType, Session } from "./types.ts";

// ---------- BR. Le bilan du dimanche ----------

/** A run of the week, with the session it was matched to. */
export type ReviewRun = Activity & { sessionId?: string };

export type ReviewInput = {
  sessions: Session[];
  runs: ReviewRun[];
  /** Her runs of the 8 weeks before, for BR4. */
  before: Activity[];
  /** Exams in the week, for BR5's word on them. */
  exams: number;
  /** Next week's sessions, for BR6. */
  next: Session[];
  /** BR7: read on Monday, the week it closes is last week and the next one is this week. */
  monday?: boolean;
};

/** « lundi » read on Sunday, « lundi dernier » read on Monday (BR7). */
const dayOf = (input: ReviewInput, start: string): string =>
  `${DAY_NAMES[weekday(start)]}${input.monday ? " dernier" : ""}`;

export type Highlight = { text: string; type?: RunType };
export type WeekReview = { done: number; planned: number; minutes: number; highlight?: Highlight; reggie: string };

/** BR1: a session cancelled by the coach was never hers to run. */
const counted = (s: Session) => s.status !== "cancelled";
/** BR3: laps within 10 % of the work target are the work; the warm-up and recoveries are slower. */
const WORK_BAND = 1.1;
/** BR4: a longest run means something once there are this many runs to compare with. */
const MIN_RUNS_BEFORE = 8;

/** « Ton fractionné », « Ta séance de vitesse »: the quality sessions BR3 can name. */
const Q_NAMES: Partial<Record<RunType, string>> = {
  T: "Ton seuil",
  CRUISE: "Ton seuil en fractions",
  I: "Ton fractionné",
  R: "Ta séance de vitesse",
  SPE: "Ta séance à allure objectif",
  FARTLEK: "Ton fartlek",
};

const paceOf = (l: { durMin: number; distM: number }): number => (l.durMin * 60_000) / l.distM;
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
/** « 16,1 ». */
const km = (m: number): string => String(Math.round(m / 100) / 10).replace(".", ",");

/** BR3: the pace of the work laps against the work target, faster by FAST_RATIO at least. */
function fasterThanPlanned(s: Session, run: Activity): boolean {
  const target = s.steps.find((st) => st.kind === "work")?.target.paceSKm;
  if (!target) return false;
  const mid = (target[0] + target[1]) / 2;
  const work = (run.laps ?? []).filter((l) => l.distM > 0 && paceOf(l) <= mid * WORK_BAND);
  const dist = sum(work.map((l) => l.distM));
  return dist > 0 && paceOf({ durMin: sum(work.map((l) => l.durMin)), distM: dist }) * FAST_RATIO <= mid;
}

function faster(input: ReviewInput): Highlight | undefined {
  const run = [...input.runs].reverse().find((r) => {
    const s = input.sessions.find((x) => x.id === r.sessionId);
    return s && Q_NAMES[s.type] && isHard(s) && fasterThanPlanned(s, r);
  });
  const s = run && input.sessions.find((x) => x.id === run.sessionId);
  const name = s && Q_NAMES[s.type];
  return run && s && name
    ? { text: `${name} de ${dayOf(input, run.start)}, plus rapide que prévu`, type: s.type }
    : undefined;
}

function longest(input: ReviewInput): Highlight | undefined {
  const run = [...input.runs].sort((a, b) => b.distM - a.distM)[0];
  if (!run || input.before.length < MIN_RUNS_BEFORE) return undefined;
  if (input.before.some((a) => a.distM >= run.distM)) return undefined;
  const type = input.sessions.find((s) => s.id === run.sessionId)?.type;
  return {
    text: `${km(run.distM)} km ${dayOf(input, run.start)}, ta plus longue course depuis deux mois`,
    ...(type ? { type } : {}),
  };
}

/** BR5: what she did, said once, kindly and without making up for anything. */
function doneLine(done: number, planned: number, exams: number): string {
  if (planned === 0) return "";
  if (done >= planned) return exams > 0 ? "Tu as tout tenu malgré tes examens." : "Tu as fait toutes tes courses.";
  if (done === 0) return "Pas de course cette semaine, ça arrive.";
  if (planned - done === 1) return "Une seule course manquée, le reste est fait.";
  return "Tu repars de là, sans rattraper ce qui manque.";
}

/** « , avec une course de plus », « , avec 2 courses de moins », or nothing. */
function runsText(more: number): string {
  if (more === 0) return "";
  const n = Math.abs(more);
  return `, avec ${n === 1 ? "une course" : `${n} courses`} de ${more > 0 ? "plus" : "moins"}`;
}

/** BR6: next week against this one, in volume and in runs. */
function nextLine(input: ReviewInput, plannedMin: number, planned: number): string {
  const next = input.next.filter((s) => s.status !== "cancelled" && s.status !== "skipped");
  const week = input.monday ? "Cette semaine" : "La semaine prochaine";
  if (next.some((s) => s.type === "RACE")) return `${week}, c'est ta course.`;
  const nextMin = sum(next.map((s) => s.durMin));
  if (nextMin === 0 || plannedMin === 0) return "";
  const ratio = nextMin / plannedMin;
  const runs = runsText(next.length - planned);
  if (ratio >= 1.05) return `${week} monte un peu${runs || ", sans course de plus"}.`;
  if (ratio <= 0.85) return `${week} est plus légère${runs}.`;
  return `${week} garde le même volume${runs}.`;
}

/**
 * BR1 to BR6: the week's runs done against those planned, the time she ran, one highlight when something stands
 * out (a quality session faster than planned, else her longest run in two months), and Reggie's sentence.
 */
export function weekReview(input: ReviewInput): WeekReview {
  const sessions = input.sessions.filter(counted);
  const done = sessions.filter((s) => s.status === "done").length;
  const planned = sessions.length;
  const highlight = faster(input) ?? longest(input);
  const reggie = [doneLine(done, planned, input.exams), nextLine(input, sum(sessions.map((s) => s.durMin)), planned)]
    .filter(Boolean)
    .join(" ");
  return {
    done,
    planned,
    minutes: Math.round(sum(input.runs.map((r) => r.durMin))),
    ...(highlight ? { highlight } : {}),
    reggie,
  };
}

// ---------- RR. Après la course objectif ----------

/** RR1: the distance a watch reads over a race, GPS drift and detours included. */
const RACE_BAND: [number, number] = [0.9, 1.2];
/** RR4: a tail this short is the watch stopped past the line; it joins the split before. */
const TAIL_M = 300;
/** F18's bounds: a lap faster than 2:30 /km or slower than 12:00 /km is a GPS glitch or a stop. */
const PACE_BOUNDS: [number, number] = [150, 720];
/** RR4: laps must cover most of the race to be read. */
const LAP_COVER = 0.9;
/** RR5: halves within 1 % are an even race. */
const EVEN = 0.01;

const raceDistance = (goalM: number, distM: number): boolean =>
  distM / goalM >= RACE_BAND[0] && distM / goalM <= RACE_BAND[1];

/** RR1: the goal race is a run on the goal's date over about the goal's distance. */
export function isGoalRace(goal: NonNullable<Goal>, run: Activity): boolean {
  return dateOf(run.start) === goal.date && raceDistance(goal.distanceM, run.distM);
}

export type RaceTime = { timeMin: number; date?: string };

/** RR3: her last race at this distance before this one, else the time she declared at it. */
export function previousRace(
  goal: NonNullable<Goal>,
  history: Activity[],
  declared?: { distanceM: number; minutes: number; date?: string },
): RaceTime | undefined {
  const last = history
    .filter((a) => a.isRace && dateOf(a.start) < goal.date && raceDistance(goal.distanceM, a.distM))
    .sort((a, b) => a.start.localeCompare(b.start))
    .at(-1);
  if (last) return { timeMin: last.durMin, date: dateOf(last.start) };
  if (declared && raceDistance(goal.distanceM, declared.distanceM))
    return { timeMin: declared.minutes, ...(declared.date ? { date: declared.date } : {}) };
  return undefined;
}

export type RaceSplit = { toKm: number; paceSKm: number };

/** RR4: about five splits whatever the race: 1 km on a 5 km, 2 km on a 10 km, 5 km on a half, 10 km on a marathon. */
const splitSize = (distanceM: number): number =>
  distanceM <= 5000 ? 1000 : distanceM <= 10000 ? 2000 : distanceM <= 21097.5 ? 5000 : 10000;

/** RR4: her pace over each part of the race, from the watch's laps; none when the laps do not cover it. */
export function raceSplits(run: Activity, distanceM: number): RaceSplit[] {
  const laps = (run.laps ?? []).filter(
    (l) => l.distM > 0 && paceOf(l) >= PACE_BOUNDS[0] && paceOf(l) <= PACE_BOUNDS[1],
  );
  if (sum(laps.map((l) => l.durMin)) < LAP_COVER * run.durMin) return [];
  const size = splitSize(distanceM);
  const parts: { distM: number; durMin: number }[] = [];
  let at = 0;
  for (const lap of laps) {
    const i = Math.floor((at + lap.distM / 2) / size);
    const part = parts[i] ?? { distM: 0, durMin: 0 };
    parts[i] = { distM: part.distM + lap.distM, durMin: part.durMin + lap.durMin };
    at += lap.distM;
  }
  const dense = parts.filter((p) => p !== undefined);
  const tail = dense.at(-1);
  const before = dense.at(-2);
  if (tail && before && tail.distM < TAIL_M) {
    dense.splice(-2, 2, { distM: before.distM + tail.distM, durMin: before.durMin + tail.durMin });
  }
  let end = 0;
  return dense.map((p) => {
    end += p.distM;
    return { toKm: Math.round(end / 100) / 10, paceSKm: paceOf(p) };
  });
}

/** RR5: Reggie's word, from the race as she ran it. */
function raceLine(splits: RaceSplit[]): string {
  const paces = splits.map((s) => s.paceSKm);
  const half = Math.floor(paces.length / 2);
  const first = paces.slice(0, half);
  const second = paces.slice(paces.length - half);
  const mean = (xs: number[]) => sum(xs) / xs.length;
  const parts: string[] = [];
  if (half > 0) {
    const gap = mean(second) / mean(first) - 1;
    if (gap < -EVEN) parts.push("Plus rapide sur la deuxième moitié que sur la première.");
    else if (gap <= EVEN) parts.push("Une allure régulière du départ à l'arrivée.");
  }
  const last = paces.at(-1);
  if (last !== undefined && paces.length > 2 && paces.every((p) => p >= last))
    parts.push("Ta fin a été ta portion la plus rapide.");
  return [...parts, "Bravo Anna. Repose-toi bien cette semaine."].join(" ");
}

export type RaceReport = {
  timeMin: number;
  /** Minutes over her target time, negative under it; absent without a target. */
  gapMin?: number;
  previous?: RaceTime;
  splits: RaceSplit[];
  reggie: string;
  /** MA6: the easy weeks that come first, whatever she picks next: « deux semaines de footings faciles ». */
  recovery: string;
};

/** RR2 to RR5: the result, against her target and her last race, split by split, with Reggie's word. */
export function raceReport(goal: NonNullable<Goal>, run: Activity, previous?: RaceTime): RaceReport {
  const splits = raceSplits(run, goal.distanceM);
  return {
    timeMin: run.durMin,
    ...(goal.targetMin ? { gapMin: run.durMin - goal.targetMin } : {}),
    ...(previous ? { previous } : {}),
    splits,
    reggie: raceLine(splits),
    recovery: recoveryText(goal.distanceM),
  };
}
