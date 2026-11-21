import * as coach from "@annarrive/coach";
import { paceLabel } from "@annarrive/protocol";
import { fitnessHistory } from "../coach-port.ts";
import type { Stores } from "../storage/stores.ts";
import { addDays, dateOf } from "../time.ts";

const EFFORT_DAYS = 84;
const VO2MAX_DAYS = 30;
const SHOWN = 8;

export const clock = (min: number): string => {
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
  let computed: coach.InitialFitness | undefined;
  try {
    const f = coach.initialFitness(history, now);
    computed = f;
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
  if (stored && computed && Math.abs(stored.vdot - computed.vdot) > 0.05)
    lines.push(`Pourquoi l'écart : ${gapReason(stored, computed, stores, today)}`);
  return lines.join("\n");
}

type Stored = NonNullable<ReturnType<Stores["fitnessEstimate"]["list"]>[number]>;

/** Why the level in service is not the one F10 reads today (algo.md F10, F11, RC8, RC11). */
function gapReason(stored: Stored, computed: coach.InitialFitness, stores: Stores, today: string): string {
  const pending = stores.proposal
    .list()
    .find((p) => p.status === "pending" && p.kind === "vdot" && p.expiresOn >= today);
  if (pending)
    return `une proposition attend sa réponse (règle ${pending.ruleId}, VDOT ${pending.from} vers ${pending.to}) : rien ne change sans son accord (RC11).`;
  if (stored.source.startsWith("proposal:"))
    return `elle a accepté ce niveau le ${stored.date} (${stored.source.slice(9)}) : seules une course, un test ou ses séances clés le font évoluer (RC1 à RC4), F10 ne le remplace plus.`;
  const then = stored.source.endsWith(":detrained")
    ? `calculé le ${stored.date} sur un effort de 6 à 12 semaines, réduit par la plus longue interruption entre cet effort et ce jour-là parmi les courses déjà importées (F11).`
    : `calculé le ${stored.date} sur les données d'alors.`;
  const next =
    computed.status === "measured" && computed.vdot > stored.vdot + 0.5
      ? "La prochaine course synchronisée lui proposera la lecture d'aujourd'hui (F10, à la hausse seulement)."
      : computed.vdot > stored.vdot
        ? "L'écart ne dépasse pas 0,5 VDOT : rien n'est proposé (F10)."
        : "F10 ne baisse jamais un niveau mesuré : il faut une course ou des séances clés plus lentes (RC2, RC4).";
  return `${then} ${next}`;
}
