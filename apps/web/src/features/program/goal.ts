import type { GoalInput } from "../../api/client.ts";
import { daysBetween } from "../../lib/date.ts";

export const RACES = [
  { race: "5 km", km: 5 },
  { race: "10 km", km: 10 },
  { race: "Semi-marathon", km: 21.1 },
  { race: "Marathon", km: 42.2 },
];

/** "2 semaines de plus, les semaines à venir sont recalculées." Shown before she confirms a new goal. */
export function goalSummary(before: GoalInput, after: GoalInput): string {
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
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}. Les semaines à venir sont recalculées, ta semaine en cours garde ce que tu as déplacé.`;
}
