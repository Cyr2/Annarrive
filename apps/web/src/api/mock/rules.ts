import {
  addDays,
  addMinutes,
  dayName,
  daysBetween,
  duration,
  minutesOf,
  relativeDay,
  weekday,
} from "../../lib/date.ts";
import {
  type ChangeOption,
  type ChangeOptionId,
  type Item,
  isRepeat,
  type ProposedSlot,
  type Run,
  type Settings,
} from "../schemas.ts";

/**
 * shortcut: a small copy of the algo rules (docs/interactions.md, rule 3) so the mock proposes plausible slots.
 * The real decisions come from packages/coach through the server; drop this file once the server answers.
 */

export const isRun = (item: Item): item is Run => item.kind === "run";
const isDemanding = (run: Run) => run.intensity !== "easy";

export function blockedReason(run: Run, date: string, items: Item[], settings: Settings, today: string) {
  if (date < today) return "Ce jour est passé";
  if (settings.noRunDays.includes(weekday(date))) return `${dayName(date)} est un jour sans course`;
  if (!isDemanding(run)) return undefined;
  const legsBefore = items.some(
    (i) => i.kind === "strength" && i.legs && !i.cancelled && (i.date === addDays(date, -1) || i.date === date),
  );
  if (legsBefore) return "Moins de 24 h après ta séance jambes";
  const hardNextDoor = items.some(
    (i) => isRun(i) && i.id !== run.id && isDemanding(i) && Math.abs(daysBetween(date, i.date)) === 1,
  );
  if (hardNextDoor) return "Pas deux séances dures d'affilée";
  return undefined;
}

function otherRunOn(date: string, run: Run, items: Item[]) {
  return items.find((i): i is Run => isRun(i) && i.date === date && i.id !== run.id);
}

function consequence(date: string, run: Run, items: Item[], today: string) {
  const other = otherRunOn(date, run, items);
  if (!other) return "Rien d'autre ne bouge dans ta semaine.";
  return `Ton ${other.title.toLowerCase()} de ${relativeDay(other.date, today).toLowerCase()} passe à ${relativeDay(run.date, today).toLowerCase()} ${other.start}.`;
}

function why(date: string, run: Run, items: Item[], today: string) {
  if (date === run.date) return "Même jour, une heure et demie plus tard";
  const legs = items.find((i) => i.kind === "strength" && i.legs && i.date > date);
  if (legs && isDemanding(run) && date < legs.date)
    return `Ta muscu jambes est ${dayName(legs.date).toLowerCase()}, l'écart est bon`;
  if (minutesOf(run.start) < 12 * 60 || date === addDays(today, 1)) return "Le plus tôt possible après ce soir";
  return "Un créneau libre, loin de tes séances dures";
}

/** Up to three slots, best first: the same day a bit later, then the next allowed days of the week. */
export function proposeSlots(run: Run, items: Item[], settings: Settings, today: string): ProposedSlot[] {
  const slots: ProposedSlot[] = [];
  const later = addMinutes(run.start, 90);
  if (run.date >= today && minutesOf(later) + run.durationMin <= minutesOf(settings.notAfter)) {
    slots.push({
      date: run.date,
      start: later,
      why: why(run.date, run, items, today),
      consequence: consequence(run.date, run, items, today),
    });
  }
  const sunday = addDays(run.date, 6 - weekday(run.date));
  for (let date = addDays(run.date, 1); date <= sunday && slots.length < 3; date = addDays(date, 1)) {
    if (blockedReason(run, date, items, settings, today)) continue;
    slots.push({
      date,
      start: run.start,
      why: why(date, run, items, today),
      consequence: consequence(date, run, items, today),
    });
  }
  return slots;
}

export function blockedDays(run: Run, items: Item[], settings: Settings, today: string, monday: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i)).flatMap((date) => {
    const reason = blockedReason(run, date, items, settings, today);
    return reason ? [{ date, reason }] : [];
  });
}

function reps(mainSet: string | undefined) {
  const match = mainSet?.match(/^(\d+) × (.+)$/);
  return match ? { count: Number(match[1]), rest: match[2] ?? "" } : undefined;
}

/** The four ways to change a session, never harder than the plan. */
export function changeOptions(run: Run): ChangeOption[] {
  const set = reps(run.mainSet);
  const shorterSet = set ? `${Math.max(2, Math.round(set.count * 0.67))} × ${set.rest}` : undefined;
  const shorterMin = Math.round((run.durationMin * 0.75) / 5) * 5;
  const options: ChangeOption[] = [
    {
      id: "shorter",
      title: "Plus court",
      detail: shorterSet
        ? `${shorterSet} à ${run.pace} · ${duration(shorterMin)}`
        : `${duration(shorterMin)}, même allure`,
      intensity: run.intensity,
    },
    {
      id: "easier",
      title: "Plus facile",
      detail: `${duration(run.durationMin)}, 6'15 à 6'45 /km`,
      intensity: "easy",
    },
    { id: "equivalent", title: "Équivalente", detail: "3 × 1 600 m à 5'10 /km · 50 min", intensity: "hard" },
    { id: "jog", title: "Footing tranquille", detail: "30 min, 6'30 à 7'00 /km", intensity: "easy" },
  ];
  return run.intensity === "hard" ? options : options.filter((o) => o.id === "shorter" || o.id === "jog");
}

export function applyChange(run: Run, option: ChangeOptionId): Run {
  const set = reps(run.mainSet);
  switch (option) {
    case "shorter": {
      const mainSet = set ? `${Math.max(2, Math.round(set.count * 0.67))} × ${set.rest}` : run.mainSet;
      const steps = run.steps.map((s) =>
        isRepeat(s) && set ? { ...s, repeat: Math.max(2, Math.round(set.count * 0.67)) } : s,
      );
      const distanceKm = run.distanceKm && Math.round(run.distanceKm * 0.75 * 10) / 10;
      return { ...run, mainSet, steps, distanceKm, durationMin: Math.round((run.durationMin * 0.75) / 5) * 5 };
    }
    case "easier":
      return easy(run, run.durationMin, "Footing facile", "6'15 à 6'45 /km");
    case "equivalent": {
      const steps = run.steps.map((s) =>
        isRepeat(s)
          ? {
              repeat: 3,
              steps: s.steps.map((l) => (l.tone === "hard" ? { ...l, label: "1 600 m", pace: "5'10 /km" } : l)),
            }
          : s,
      );
      return { ...run, mainSet: "3 × 1 600 m", pace: "5'10 /km", steps };
    }
    case "jog":
      return easy(run, 30, "Footing tranquille", "6'30 à 7'00 /km");
  }
}

export function easy(run: Run, durationMin: number, title: string, pace: string): Run {
  return {
    ...run,
    title,
    durationMin,
    pace,
    intensity: "easy",
    mainSet: undefined,
    distanceKm: undefined,
    steps: [{ label: `${durationMin} min`, pace, tone: "plain" }],
    why: "Une séance facile à la place : tu gardes l'habitude sans forcer.",
  };
}
