import { addDays, duration, relativeDay } from "../../lib/date.ts";
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
  const row = (run: Run, label: string, tone: ChangeRow["tone"], was: Run) =>
    rows.push({
      day: relativeDay(run.date, today),
      label,
      tone,
      before: `${was.title} · ${duration(was.durationMin)}`,
    });

  let next = items.flatMap((item): Item[] => {
    if (!affected(item)) return [item];
    const replacement = replace(item, input);
    if (replacement === item) return [item];
    if (!replacement) {
      row(item, "Repos", "rest", item);
      return [];
    }
    row(replacement, `${replacement.title} · ${duration(replacement.durationMin)}`, "easy", item);
    return [replacement];
  });

  if (input.reason === "tired") {
    // The next hard session is lightened when it falls the day after.
    const tomorrow = addDays(last, 1);
    next = next.map((item) => {
      if (!isRun(item) || item.date !== tomorrow || item.intensity !== "hard") return item;
      const lighter = {
        ...easy(item, item.durationMin, "Footing facile", "6'30 /km"),
        lightened: "Allégée : tu étais fatiguée la veille",
      };
      row(lighter, `${lighter.title} · allégé`, "easy", item);
      return lighter;
    });
  }
  return { items: next, rows };
}

const EF = "6'45 /km";

/** Sickness and pain never block a run: rest is advised, and a run she still wants becomes easy. */
function replace(run: Run, input: UnavailableInput): Run | undefined {
  switch (input.reason) {
    case "tired":
      return undefined;
    case "sick":
      if (input.fever)
        return advised(easy(run, 20, "Footing tranquille", EF), "Repos conseillé tant que tu as de la fièvre");
      return run.intensity === "hard" ? easy(run, run.durationMin, "Footing tranquille", EF) : run;
    case "pain":
      if ((input.pain ?? 10) <= 3) return easy(run, 30, "Footing tranquille", EF);
      return advised(
        easy(run, 20, "Footing tranquille", EF),
        "Repos ou vélo conseillé. Si tu cours, arrête-toi si ça monte",
      );
  }
}

function advised(run: Run, reason: string): Run {
  return { ...run, lightened: reason };
}
