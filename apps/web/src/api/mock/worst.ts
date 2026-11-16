import { addDays } from "../../lib/date.ts";
import type { CalendarEvent, Item, Program } from "../schemas.ts";

/**
 * Dev only (`?mock=worst`): the longest realistic values, entering at the same boundary as the demo data,
 * to check that every screen still holds (break-ui). Real course names from a French university timetable.
 */
const TITLES: Record<string, string> = {
  Physique: "Méthodologie de la recherche en sciences humaines et sociales",
  Révision: "Révision partiel de thermodynamique",
  Fractionné: "Fractionné en côte, retour en descente",
  "Haut du corps": "Renforcement haut du corps et gainage",
  Français: "Français langue étrangère, expression écrite",
  "Footing facile": "Footing facile en endurance fondamentale",
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
      pace: "4:35 à 4:50",
      distanceKm: 12.5,
      durationMin: 105,
      lightened: "Allégée : nuit courte, fréquence cardiaque au repos plus haute que d'habitude et Body Battery bas",
      steps: item.steps.map((s) =>
        s.tone === "hard" ? { ...s, label: "10 × 400 m + 5 × 200 m", pace: "4:35 à 4:50 /km" } : s,
      ),
    };
  });
}

export function worstProgram(program: Program): Program {
  return {
    ...program,
    goal: { ...program.goal, race: "Marathon de La Rochelle", targetTime: "3:59:59", targetTag: "ambitious" },
    settings: { ...program.settings, noRunDays: [0, 2, 5, 6] },
    strength: program.strength.map((t) =>
      t.id === "s-upper" ? { ...t, name: "Renforcement haut du corps et gainage" } : t,
    ),
  };
}
