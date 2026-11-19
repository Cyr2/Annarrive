import { addDays } from "../../lib/date.ts";
import type { CalendarEvent, Item, Program, Step } from "../schemas.ts";

/**
 * Dev only (`?mock=worst`): the longest realistic values, entering at the same boundary as the demo data,
 * to check that every screen still holds (break-ui). Real course names from a French university timetable.
 */
const TITLES: Record<string, string> = {
  Physique: "Méthodologie de la recherche en sciences humaines et sociales",
  Révision: "Révision partiel de thermodynamique",
  Fractionné: "Fractionné long, récupération en trottinant",
  "Haut du corps": "Renforcement haut du corps et gainage",
  "(M1M2E G3 NL) UE1 Français": "(M1M2E G3 NL) UE1 Français langue étrangère, expression écrite",
  "Footing facile": "Footing facile et tranquille",
  "Sortie longue": "Sortie longue avec la fin à allure semi",
};

/** Twelve back-to-back slots on one day, the busiest a timetable plus Anna's own events can get. */
function crowdedDay(date: string): CalendarEvent[] {
  return Array.from({ length: 12 }, (_, i) => ({
    id: `worst-${i}`,
    kind: i % 4 === 3 ? "busy" : "class",
    date,
    start: `${8 + i}:00`,
    end: `${8 + i}:50`,
    title: i % 2 ? "Méthodologie de la recherche en sciences humaines et sociales" : `TD ${i + 1}`,
  }));
}

/** This week at its longest, with a crowded Wednesday; the next week empty (no run, no class). */
export function worstItems(items: Item[], monday: string, thisMonday: string): Item[] {
  if (monday !== thisMonday) return [];
  return [...longest(items), ...crowdedDay(addDays(monday, 2))];
}

function longest(items: Item[]): Item[] {
  return items.map((item) => {
    const title = TITLES[item.title] ?? item.title;
    if (item.kind !== "run" || item.intensity !== "hard") return { ...item, title };
    return {
      ...item,
      title,
      mainSet: "10 × 400 m + 5 × 200 m",
      pace: "4'40 /km",
      distanceKm: 12.5,
      durationMin: 105,
      lightened: "Allégée : nuit courte, fréquence cardiaque au repos plus haute que d'habitude et Body Battery bas",
      // Worst case: long labels, a range pace at 320 px, and two repeat groups in a row.
      steps: item.steps.flatMap((s): Step[] =>
        "repeat" in s
          ? [
              { repeat: 10, steps: [{ label: "400 m", pace: "4'40 /km", tone: "hard" as const }] },
              {
                repeat: 5,
                steps: [
                  { label: "200 m", pace: "4'25 /km", tone: "hard" as const },
                  { label: "Récupérer · 1 min 30", pace: "6'50 /km", tone: "muted" as const },
                ],
              },
            ]
          : [s],
      ),
    };
  });
}

export function worstProgram(program: Program): Program {
  return {
    ...program,
    goal: {
      ...program.goal,
      race: "Marathon de La Rochelle",
      targetTime: "3:59:59",
      targetTag: "ambitious",
      targetWhy: { currentMin: 268, weeks: 14, gain: 0.105, gainMax: 0.049 },
    },
    settings: { ...program.settings, noRunDays: [0, 2, 5, 6] },
    strength: program.strength.map((t) =>
      t.id === "s-upper" ? { ...t, name: "Renforcement haut du corps et gainage" } : t,
    ),
  };
}
