import { isHard } from "./catalog.ts";
import { addDays, at, dateOf, daysBetween, hoursBetween, toIso, toMin } from "./dates.ts";
import type { CalEvent, DailySignal, FeelLog, Session, Settings } from "./types.ts";

export type SignalId = "SG1" | "SG2" | "SG3" | "SG4" | "SG5";
export type Baseline = { mean: number; sd: number; median: number; n: number };

const VALID_N = 14;
const RHR_DEFAULT_N = 7;
const SD_FLOOR = { rhr: 1.5, sleep: 30, bb: 5, stress: 3 };

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
};

/** B1: window ending the day before `now`, sick days excluded; sample standard deviation. */
export function baseline(
  values: { date: string; v?: number }[],
  excludeDates: string[],
  now: string,
  window = 28,
): Baseline | null {
  const today = dateOf(now);
  const xs = values
    .filter((x) => x.v !== undefined && !excludeDates.includes(x.date))
    .filter((x) => daysBetween(x.date, today) >= 1 && daysBetween(x.date, today) <= window)
    .map((x) => x.v ?? 0);
  if (xs.length === 0) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1)) : 0;
  return { mean, sd, median: median(xs), n: xs.length };
}

export type ReadinessCtx = {
  lastFeels: FeelLog[];
  cal: CalEvent[];
  sick: string[];
  settings: Settings;
  /** Declared usual sleep, B3. */
  usualSleepMin?: number;
};

type Check = { fired: boolean; missing: boolean; usedDefault: boolean };
const NONE: Check = { fired: false, missing: false, usedDefault: false };

function rhrCheck(today: DailySignal, b: Baseline | null): Check {
  if (today.rhr === undefined) return { ...NONE, missing: true };
  if (!b || b.n < RHR_DEFAULT_N) return { ...NONE, usedDefault: true };
  if (b.n < VALID_N) return { fired: today.rhr >= b.mean + 5, missing: false, usedDefault: true };
  const sd = Math.max(b.sd, SD_FLOOR.rhr);
  return { ...NONE, fired: today.rhr >= b.mean + Math.max(2 * sd, 3) };
}

function sleepCheck(today: DailySignal, history: DailySignal[], b: Baseline | null, usual?: number): Check {
  const last = today.sleepMin;
  if (last === undefined) return { ...NONE, missing: true };
  if (!b || b.n < VALID_N)
    return { fired: last <= Math.min(360, (usual ?? 480) - 90), missing: false, usedDefault: true };
  const sd = Math.max(b.sd, SD_FLOOR.sleep);
  const nights = [
    last,
    ...history
      .filter((h) => h.date < today.date)
      .slice(-2)
      .map((h) => h.sleepMin),
  ].filter((x) => x !== undefined);
  const mean3 = nights.reduce((a, c) => a + c, 0) / nights.length;
  const fired = last <= b.median - Math.max(2 * sd, 60) || (nights.length === 3 && mean3 <= b.median - 60);
  return { ...NONE, fired };
}

/** SG3: Body Battery and stress come from the same Firstbeat measure, so they count as one signal. */
function garminCheck(today: DailySignal, bb: Baseline | null, stress: Baseline | null): Check {
  if (today.bodyBatteryWake === undefined && today.stressAvg === undefined) return { ...NONE, missing: true };
  const low =
    today.bodyBatteryWake !== undefined &&
    bb !== null &&
    bb.n >= VALID_N &&
    today.bodyBatteryWake <= bb.mean - 2 * Math.max(bb.sd, SD_FLOOR.bb);
  const high =
    today.stressAvg !== undefined &&
    stress !== null &&
    stress.n >= VALID_N &&
    today.stressAvg >= stress.mean + 2 * Math.max(stress.sd, SD_FLOOR.stress);
  const usable = (bb?.n ?? 0) >= VALID_N || (stress?.n ?? 0) >= VALID_N;
  return { fired: low || high, missing: false, usedDefault: !usable };
}

const feelCheck = (date: string, feels: FeelLog[]): boolean => {
  const last = feels
    .filter((f) => f.date <= date && daysBetween(f.date, date) <= 2)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  return last !== undefined && last.feel === "hard" && ranEasy(last);
};

/** An easy session she also ran easy (AD1): one run fast by choice is not an easy run felt hard. */
export const ranEasy = (f: FeelLog): boolean => f.rpeTarget <= 4 && (f.rpeDone ?? f.rpeTarget) <= 4;

const examCheck = (date: string, cal: CalEvent[]): boolean =>
  cal.some((e) => e.kind === "exam" && [date, addDays(date, 1)].includes(dateOf(e.start)));

/** SG1 to SG5 for the morning of `today.date`. D8: with the sleep/HR switch off only SG4 and SG5 count. */
export function dailySignals(
  today: DailySignal,
  history: DailySignal[],
  ctx: ReadinessCtx,
): { signals: SignalId[]; missing: SignalId[]; usedDefaults: SignalId[] } {
  const base = (pick: (d: DailySignal) => number | undefined): Baseline | null =>
    baseline(
      history.map((h) => ({ date: h.date, v: pick(h) })),
      ctx.sick,
      today.date,
    );
  const checks: [SignalId, Check][] = [
    ["SG4", { ...NONE, fired: feelCheck(today.date, ctx.lastFeels) }],
    ["SG5", { ...NONE, fired: examCheck(today.date, ctx.cal) }],
  ];
  if (ctx.settings.useSleepHr) {
    checks.unshift(
      [
        "SG1",
        rhrCheck(
          today,
          base((d) => d.rhr),
        ),
      ],
      [
        "SG2",
        sleepCheck(
          today,
          history,
          base((d) => d.sleepMin),
          ctx.usualSleepMin,
        ),
      ],
      [
        "SG3",
        garminCheck(
          today,
          base((d) => d.bodyBatteryWake),
          base((d) => d.stressAvg),
        ),
      ],
    );
  }
  const ids = (f: (c: Check) => boolean): SignalId[] => checks.filter(([, c]) => f(c)).map(([id]) => id);
  return { signals: ids((c) => c.fired), missing: ids((c) => c.missing), usedDefaults: ids((c) => c.usedDefault) };
}

/** D2. */
export const isConfirmed = (today: SignalId[], yesterday: SignalId[] | null): boolean =>
  today.length >= 2 || today.some((s) => yesterday?.includes(s) === true);

const BODY: SignalId[] = ["SG1", "SG2", "SG3"];

/**
 * The days among `dates` whose body signals (SG1 to SG3: heart rate, sleep, Garmin) were confirmed under D2: the
 * fatigue P9 and RC5 read. An exam or a hard feel alone is not fatigue of the body.
 */
export function fatigueDays(history: DailySignal[], ctx: ReadinessCtx, dates: string[]): string[] {
  const body = (date: string): SignalId[] =>
    dailySignals(
      history.find((h) => h.date === date) ?? { date },
      history.filter((h) => h.date < date),
      ctx,
    ).signals.filter((s) => BODY.includes(s));
  return dates.filter((d) => isConfirmed(body(d), body(addDays(d, -1))));
}

/** D1: decide at the first sync with the night, or at min(10:00, session - 2 h) without one. */
export function decisionDue(now: string, sessionStart: string | null, nightSynced: boolean): boolean {
  if (nightSynced) return true;
  const ten = at(dateOf(now), "10:00");
  const deadline = sessionStart ? toIso(Math.min(toMin(ten), toMin(sessionStart) - 120)) : ten;
  return now >= deadline;
}

export type Decision = {
  action: "keep" | "easier" | "shorter" | "proposeRest" | "none";
  frozen: true;
  ruleIds: string[];
};

/**
 * D2 to D9. The decision only ever lightens; applying it is the caller's job (events.changeOptions).
 * `session.frozen` means a decision was already taken today (D7).
 */
export function dailyDecision(
  session: Session | null,
  signals: SignalId[],
  yesterday: SignalId[] | null,
  now: string,
): Decision {
  const d = (action: Decision["action"], ...ruleIds: string[]): Decision => ({ action, frozen: true, ruleIds });
  if (!session) return d("none");
  if (session.frozen) return d("none", "D7");
  if (session.manual || hoursBetween(session.start, now) >= 0) return d("none", "D6");
  if (!isConfirmed(signals, yesterday)) return d("keep", "D2");
  if (signals.length >= 4) return d("proposeRest", "D5");
  if (isHard(session)) return d("easier", "D3");
  return signals.length === 3 ? d("shorter", "D4") : d("keep", "D4");
}
