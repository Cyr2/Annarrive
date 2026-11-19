import type { MoveOptions, Slot } from "../../api/schemas.ts";
import { addDays, relativeMoment } from "../../lib/date.ts";

/** "ce soir 19:30", "mercredi 18:00": the end of "Déplacer : …". */
export function shortMoment(slot: Slot, today: string): string {
  return relativeMoment(slot.date, slot.start, today)
    .replace(/^\S/, (c) => c.toLowerCase())
    .replace("aujourd'hui", "aujourd'hui à");
}

export type DayChoice = { date: string; blocked?: string };

/** The seven days of the session's week, each with the rule that blocks it, if any. */
export function dayChoices(monday: string, options: MoveOptions): DayChoice[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((date) => ({
    date,
    blocked: options.blocked.find((b) => b.date === date)?.reason,
  }));
}

/** What else moves if she picks this slot. A free choice gets no promise beyond the rules check. */
export function consequenceOf(slot: Slot, options: MoveOptions): string {
  const proposed = options.slots.find((s) => s.date === slot.date && s.start === slot.start);
  return proposed?.consequence ?? "Si autre chose doit bouger, je te le dis après.";
}
