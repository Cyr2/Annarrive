import type { GoalInput } from "../../api/client.ts";
import { daysBetween } from "../../lib/date.ts";

export const RACES = [
  { race: "5 km", km: 5 },
  { race: "10 km", km: 10 },
  { race: "Semi-marathon", km: 21.1 },
  { race: "Marathon", km: 42.2 },
];

/** The race as she calls it, else by its distance. */
export const raceTitle = (r: { race: string; name?: string | undefined }) => r.name || r.race;

/** After a race: the same distance as a suggestion, the rest of the race she ran left blank. */
export const nextRaceDraft = (ran: GoalInput): GoalInput => ({ race: ran.race, distanceKm: ran.distanceKm, date: "" });

/** A race to prepare is after today; a race set for today stays as it is while she edits something else. */
export const goalDateOk = (date: string, today: string, current?: string) =>
  date > today || (date !== "" && date === current);

/** A race this close, set or removed, rebuilds the current week too (algo.md EV20). */
const RACE_CONFLICT_DAYS = 7;

/** What becomes of the current week (algo.md EV14, EV20). */
function weekNote(before: GoalInput, after: GoalInput, today: string): string {
  const soon = (g: GoalInput) => g.date >= today && daysBetween(today, g.date) <= RACE_CONFLICT_DAYS;
  if (soon(after)) return "Ta semaine devient une semaine de course : rien de dur dans les 3 jours avant.";
  if (soon(before)) return "Les semaines à venir sont recalculées, ta semaine en cours aussi.";
  return "Les semaines à venir sont recalculées, ta semaine en cours ne change pas.";
}

/**
 * After a race, the one she ran is no base to count from (audit N4): the new race is counted from today.
 * « Semi de Strasbourg dans 20 semaines, objectif finir. »
 */
export function nextRaceSummary(after: GoalInput, today: string): string {
  const weeks = Math.round(daysBetween(today, after.date) / 7);
  const when = weeks > 1 ? `dans ${weeks} semaines` : weeks === 1 ? "dans 1 semaine" : "dans quelques jours";
  const aim = after.targetTime ? `chrono visé ${after.targetTime}` : "objectif finir";
  return `${raceTitle(after)} ${when}, ${aim}. Ton plan est construit jusque-là.`;
}

/** "2 semaines de plus, les semaines à venir sont recalculées." Shown before she confirms a new goal. */
export function goalSummary(before: GoalInput, after: GoalInput, today: string): string {
  const weeks = Math.round(daysBetween(before.date, after.date) / 7);
  const parts: string[] = [];
  if (after.race !== before.race) parts.push(`Nouvelle course : ${after.race.toLowerCase()}`);
  if (weeks > 0) parts.push(`${weeks} ${weeks > 1 ? "semaines" : "semaine"} de plus`);
  if (weeks < 0) parts.push(`${-weeks} ${weeks < -1 ? "semaines" : "semaine"} de moins`);
  if ((after.targetTime ?? "") !== (before.targetTime ?? "")) {
    parts.push(after.targetTime ? `chrono visé ${after.targetTime}` : "sans chrono, objectif finir");
  }
  if (parts.length === 0) return "Rien ne change pour l'instant.";
  const text = parts.join(", ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}. ${weekNote(before, after, today)}`;
}

/** « Ce qui change »: why Valider waits when the chrono is missing, else the new race, else what changes. */
export function changeText(
  before: GoalInput,
  after: GoalInput,
  today: string,
  { next, noTime }: { next: boolean; noTime: boolean },
): string {
  if (noTime) return "Écris ton chrono, ou choisis « Juste finir ».";
  return next ? nextRaceSummary(after, today) : goalSummary(before, after, today);
}
