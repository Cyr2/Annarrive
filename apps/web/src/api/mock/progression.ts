import type { Progression } from "@annarrive/protocol";
import { addDays } from "../../lib/date.ts";

/** Minutes planned in each of the 12 weeks: a 3:1 build, then the taper. */
const PLANNED = [150, 160, 175, 174, 190, 205, 165, 220, 230, 240, 170, 120];
/** What she ran in the weeks begun; the current one is half done. */
const DONE = [148, 163, 158, 108];
/** Her half at the end of each week begun: 1:53:30 at the start, two level changes since. */
const ESTIMATES = [113.5, 112.2, 111, 111];

/** Week 4 of 12 of the seeded plan (seed.ts): the numbers of the mockup, in minutes. */
export function seedProgression(monday: string, raceDate: string): NonNullable<Progression> {
  const first = addDays(monday, -21);
  return {
    distanceM: 21097.5,
    currentMin: 111,
    targetMin: 108,
    raceDate,
    weeks: PLANNED.map((plannedMin, i) => {
      const estimateMin = ESTIMATES[i];
      return {
        monday: addDays(first, 7 * i),
        ...(estimateMin ? { estimateMin } : {}),
        plannedMin,
        doneMin: DONE[i] ?? 0,
      };
    }),
    kept: { kept: 11, total: 12 },
    changes: [
      {
        date: addDays(monday, -4),
        start: false,
        line: "Seuil et fractionné plus rapides que prévu : footing à 6'05 /km au lieu de 6'09 /km.",
      },
      {
        date: addDays(first, 10),
        start: false,
        line: "Une course récente au-dessus de ton niveau : footing à 6'09 /km au lieu de 6'14 /km.",
      },
      { date: first, start: true, line: "Ta meilleure course récente : temps estimé 1:53:30." },
    ],
  };
}
