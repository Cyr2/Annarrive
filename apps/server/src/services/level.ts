import * as coach from "@annarrive/coach";
import { paceLabel } from "@annarrive/protocol";
import { fitnessHistory } from "../coach-port.ts";
import type { Stores } from "../storage/stores.ts";
import { addDays, dateOf } from "../time.ts";

const EFFORT_DAYS = 84;
const VO2MAX_DAYS = 30;
const SHOWN = 8;

const clock = (min: number): string => {
  const s = Math.round(min * 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return s >= 3600
    ? `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`
    : `${Math.floor(s / 60)}:${pad(s % 60)}`;
};
const km = (m: number): string => `${(m / 1000).toFixed(2)} km`;
const KINDS = { race: "course/max", threshold: "seuil (FC)", training: "plancher" } as const;

/**
 * What `cli/level.ts` prints: how F10 reads her level from the stored data today, effort by effort, so the owner
 * can check it against what she really runs. Read only.
 */
export function levelReport(stores: Stores, now: string): string {
  const today = dateOf(now);
  const activities = stores.activity.overlapping(`${addDays(today, -EFFORT_DAYS)}T00:00`, now);
  const vo2max = stores.dailySignal
    .overlapping(addDays(today, -VO2MAX_DAYS), addDays(today, 1))
    .findLast((d) => d.vo2max !== undefined)?.vo2max;
  const declared = stores.program.get("current")?.value.declaredTime;
  const history = fitnessHistory(activities, vo2max, declared);
  const readings = coach.effortReadings(history, now).sort((a, b) => b.vdot - a.vdot);
  const stored = stores.fitnessEstimate.list().at(-1);
  const lines = [
    `Niveau calculé le ${today}`,
    `Courses lues (12 semaines) : ${activities.length}, dont ${activities.filter((a) => a.laps?.length).length} avec leurs tours`,
    `FC max observée : ${history.hr?.hrMax ?? "inconnue"}`,
    `VO2max Garmin : ${vo2max ?? "aucune sur 30 jours"}`,
    `Chrono déclaré : ${declared ? `${km(declared.distanceM)} en ${clock(declared.minutes)}${declared.date ? ` (${declared.date})` : " (estimé)"}, VDOT ${coach.vdot(declared.distanceM, declared.minutes).toFixed(1)}` : "aucun"}`,
    "",
    `Meilleurs efforts (${Math.min(SHOWN, readings.length)} sur ${readings.length}) :`,
    ...readings
      .slice(0, SHOWN)
      .map(
        (r) =>
          `  ${r.start.slice(0, 10)}  ${km(r.distM)} en ${clock(r.durMin)}  ${paceLabel((r.durMin * 60_000) / r.distM)}  ${KINDS[r.kind]}  VDOT ${r.vdot.toFixed(1)}`,
      ),
    "",
  ];
  try {
    const f = coach.initialFitness(history, now);
    const p = coach.paces(f.vdot);
    lines.push(
      `Niveau retenu : VDOT ${f.vdot.toFixed(1)} (${f.status === "measured" ? "mesuré" : "provisoire"}, source ${f.source})`,
      `  E ${paceLabel(p.E)}`,
      `  M ${paceLabel(p.M)}`,
      `  T ${paceLabel(p.T)}`,
      `  I ${paceLabel(p.I)}`,
      `  R ${paceLabel(p.R)}`,
    );
  } catch {
    lines.push("Niveau retenu : aucun (ni effort, ni VO2max, ni chrono déclaré)");
  }
  lines.push(
    `Niveau en service : ${stored ? `VDOT ${stored.vdot.toFixed(1)} du ${stored.date} (source ${stored.source}${stored.provisional ? ", provisoire" : ""})` : "aucun"}`,
  );
  return lines.join("\n");
}
