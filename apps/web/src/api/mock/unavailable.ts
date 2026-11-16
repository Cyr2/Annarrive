import { addDays, relativeDay } from "../../lib/date.ts";
import type { UnavailableInput } from "../client.ts";
import type { ChangeRow, Item, Run } from "../schemas.ts";
import { easy, isRun } from "./rules.ts";

/**
 * shortcut: the "Pas dispo" outcomes of docs/interactions.md applied to a list of items, for the mock only.
 * Returns the new items and the rows the summary card shows.
 */
export function applyUnavailable(items: Item[], input: UnavailableInput, today: string) {
  // Fever: rest is advised until she says she feels better, so the advice covers the coming week.
  const last = input.reason === "sick" && input.fever ? addDays(today, 6) : (input.until ?? today);
  const affected = (i: Item): i is Run => isRun(i) && i.date >= today && i.date <= last;
  const rows: ChangeRow[] = [];
  const row = (run: Run, label: string, tone: ChangeRow["tone"]) =>
    rows.push({ day: relativeDay(run.date, today), label, tone });

  let next = items.flatMap((item): Item[] => {
    if (!affected(item)) return [item];
    const replacement = replace(item, input);
    if (replacement === item) return [item];
    if (!replacement) {
      row(item, `Repos, ${item.title.toLowerCase()} retiré`, "rest");
      return [];
    }
    row(replacement, `${replacement.title} · ${replacement.durationMin} min`, "easy");
    return [replacement];
  });

  if (input.reason === "tired") {
    // The next hard session is lightened when it falls the day after.
    const tomorrow = addDays(last, 1);
    next = next.map((item) => {
      if (!isRun(item) || item.date !== tomorrow || item.intensity !== "hard") return item;
      const lighter = {
        ...easy(item, item.durationMin, "Footing facile", "6:15 à 6:45"),
        lightened: "Allégée : tu étais fatiguée la veille",
      };
      row(lighter, `${lighter.title} · allégé`, "easy");
      return lighter;
    });
  }
  return { items: next, rows };
}

const EF = "6:30 à 7:00";

/** Sickness and pain never block a run: rest is advised, and a run she still wants becomes easy. */
function replace(run: Run, input: UnavailableInput): Run | undefined {
  switch (input.reason) {
    case "tired":
      return undefined;
    case "sick":
      if (input.fever)
        return advised(easy(run, 20, "Footing tranquille", EF), "Repos conseillé tant que tu as de la fièvre");
      return run.intensity === "hard" ? easy(run, run.durationMin, "Endurance fondamentale", EF) : run;
    case "pain":
      if ((input.pain ?? 10) <= 3) return easy(run, 30, "Endurance fondamentale", EF);
      return advised(
        easy(run, 20, "Footing tranquille", EF),
        "Repos ou vélo conseillé. Si tu cours, arrête-toi si ça monte",
      );
  }
}

function advised(run: Run, reason: string): Run {
  return { ...run, lightened: reason };
}
