import * as coach from "@annarrive/coach";
import type { Level } from "@annarrive/protocol";
import type { CoachPort } from "../coach-port.ts";
import type { Stores } from "../storage/stores.ts";
import { addDays, dateOf } from "../time.ts";
import type { PlanService } from "./plan.ts";

/** F19: Garmin's VO2max stands for 30 days. NV2: 8 weeks of volume, long runs of 6 weeks. */
const VO2MAX_DAYS = 30;
const VOLUME_DAYS = 56;
const LONG_RUN_DAYS = 42;

/** Programme's « Ton niveau » (algo.md M13): read only, from what is stored. Null before her level is known. */
export function levelOf(stores: Stores, plan: PlanService, port: CoachPort, now: string): Level {
  const st = plan.coachState();
  if (!st.fitness) return null;
  const today = dateOf(now);
  const vo2max = stores.dailySignal
    .overlapping(addDays(today, -VO2MAX_DAYS), addDays(today, 1))
    .findLast((d) => d.vo2max !== undefined);
  const declared = st.program.declaredTime;
  const runs = stores.activity.overlapping(`${addDays(today, -VOLUME_DAYS)}T00:00`, now).map((a) => {
    // A run matched to a planned TEST is the app's test (F14).
    const session = a.sessionId ? stores.plannedSession.get(a.sessionId) : undefined;
    return session?.type === "TEST" ? { ...a, isTest: true } : a;
  });
  const longFrom = addDays(today, -LONG_RUN_DAYS);
  // NV2: a race measures her, it is not the training a marathon time needs (G1).
  const training = runs.filter((r) => !r.isRace);
  const volume = {
    avgWeeklyMin: training.reduce((sum, r) => sum + r.durMin, 0) / (VOLUME_DAYS / 7),
    longestRunMin: Math.max(0, ...training.filter((r) => dateOf(r.start) >= longFrom).map((r) => r.durMin)),
  };
  const tPace = coach.paces(st.fitness.vdot).T;
  const hr = coach.thresholdHr(runs, tPace, now);
  return {
    provisional: st.fitness.provisional ?? false,
    since: st.fitness.date,
    ...(vo2max?.vo2max && {
      vo2max: {
        value: vo2max.vo2max,
        date: vo2max.id,
        ...(declared && { versus: port.vo2maxVersusRace(vo2max.vo2max, declared) }),
      },
    }),
    thresholdPace: tPace,
    ...(hr && { thresholdHr: hr }),
    predictions: coach.racePredictions(st.fitness.vdot, volume).map(({ distM, min, bestCase }) => ({
      distanceM: distM,
      ...(min && { min }),
      ...(bestCase && { bestCase }),
    })),
    ...(st.program.goal && { goalDistanceM: st.program.goal.distanceM }),
  };
}
