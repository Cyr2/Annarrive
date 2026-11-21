import { type Level, paceLabel } from "@annarrive/protocol";
import { dayMonth } from "../../lib/date.ts";
import { shortTime } from "../progression/progression.ts";

export type Data = NonNullable<Level>;
export type Figure = { label: string; value: string; unit?: string; detail: string; pending?: true };

const VERSUS = { agrees: "en accord avec", above: "au-dessus de", below: "en dessous de" } as const;
const HR_FROM = {
  test: (date: string) => `Ton test du ${dayMonth(date)}`,
  race: (date: string) => `Ta course du ${dayMonth(date)}`,
  laps: () => "Tes 2 séances au seuil",
} as const;

/** « Ton niveau »: VO2max (only when her watch gave one), threshold pace, threshold heart rate, each with its source. */
export function figures(d: Data): Figure[] {
  const [pace = "", unit] = paceLabel(d.thresholdPace).split(" ");
  const hr = d.thresholdHr;
  const vo2max = d.vo2max && {
    label: "VO2max",
    value: String(Math.round(d.vo2max.value)),
    // F19: what her watch says next to her race, when she gave one.
    detail: d.vo2max.versus ? `Garmin, ${VERSUS[d.vo2max.versus]} ta course` : `Garmin, le ${dayMonth(d.vo2max.date)}`,
  };
  return [
    ...(vo2max ? [vo2max] : []),
    {
      label: "Allure seuil",
      value: pace,
      ...(unit && { unit }),
      detail: d.provisional ? "Estimée avant ta première course" : `Calculée le ${dayMonth(d.since)}`,
    },
    hr
      ? { label: "FC seuil", value: String(hr.bpm), unit: "bpm", detail: HR_FROM[hr.from](hr.date) }
      : { label: "FC seuil", value: "À mesurer", detail: "Se lit sur une séance au seuil", pending: true },
  ];
}

const RACES: Record<number, string> = { 5000: "5 km", 10000: "10 km", 21097.5: "Semi", 42195: "Marathon" };

export type Chrono = { label: string; value: string; bestCase: boolean; goal: boolean; detail?: string };

/** « Tes chronos possibles »: « ≈ » while her level is provisional; a marathon waits for longer runs (NV2). */
export function chronos(d: Data): Chrono[] {
  return d.predictions.map((p) => ({
    label: RACES[p.distanceM] ?? `${p.distanceM / 1000} km`,
    value: p.min ? `${d.provisional ? "≈ " : ""}${shortTime(p.min)}` : "Pas encore",
    bestCase: p.bestCase ?? false,
    goal: p.distanceM === d.goalDistanceM,
    ...(!p.min && { detail: "Après des sorties plus longues" }),
  }));
}

export const footnote = (d: Data): string =>
  d.provisional
    ? "Estimés en attendant ta première course mesurée, à quelques minutes près."
    : "À quelques minutes près, si tu prépares la distance.";
