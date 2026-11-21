import { describe, expect, it } from "vitest";
import { phaseLabels } from "./phaseLabels.ts";

const FOUR = ["Base", "Développement", "Spécifique", "Affûtage"];
const THREE = ["Base", "Spécifique", "Affûtage"];
/** A caption font of 7 px a character, 7.5 in bold. */
const measure = (text: string, bold: boolean) => text.length * (bold ? 7.5 : 7);
const layout = (width: number, weeks: number[], current: number) =>
  phaseLabels({ width, weeks, names: weeks.length === 3 ? THREE : FOUR, current, measure }).map(
    (l) => l && `${Math.round(l.x * 10) / 10} ${l.text}`,
  );

describe("phaseLabels (mockup programme-v2, B)", () => {
  it.each([
    [
      "18 weeks, base, 320 px: each under its segment",
      320,
      [10, 5, 3],
      0,
      ["0 Base", "177.3 Spécifique", "278 Affût."],
    ],
    ["18 weeks, base, 280 px", 280, [10, 5, 3], 0, ["0 Base", "155.1 Spécifique", "238 Affût."]],
    [
      "development, 328 px: the current name whole",
      328,
      [3, 3, 4, 2],
      1,
      ["0 Base", "83 Développement", "188.5 Spécifique", "286 Affût."],
    ],
    [
      "development, 280 px: Spé. stays in its segment",
      280,
      [3, 3, 4, 2],
      1,
      ["0 Base", "71 Développement", "176.5 Spé.", "238 Affût."],
    ],
    [
      "development, 240 px: no room left for Affût.",
      240,
      [3, 3, 4, 2],
      1,
      ["0 Base", "61 Développement", "166.5 Spé.", null],
    ],
    [
      "taper in progress: right-aligned, Spécifique 8 px before it",
      280,
      [3, 3, 4, 2],
      3,
      ["0 Base", "71 Dév.", "142 Spécifique", "220 Affûtage"],
    ],
    [
      "base in progress: short forms elsewhere",
      280,
      [3, 3, 4, 2],
      0,
      ["0 Base", "71 Dév.", "142 Spécifique", "238 Affût."],
    ],
    ["specific in progress, 328 px", 328, [3, 3, 4, 2], 2, ["0 Base", "83 Dév.", "166 Spécifique", "286 Affût."]],
    [
      "specific in progress, 200 px: the last name hidden",
      200,
      [3, 3, 4, 2],
      2,
      ["0 Base", "51 Dév.", "102 Spécifique", null],
    ],
    [
      "base in progress, 160 px: Affût. borrows the room after Spé.",
      160,
      [3, 3, 4, 2],
      0,
      ["0 Base", "41 Dév.", "82 Spé.", "118 Affût."],
    ],
    [
      "one week of taper: too narrow even for Affût.",
      280,
      [4, 4, 3, 1],
      2,
      ["0 Base", "93.3 Dév.", "186.7 Spécifique", null],
    ],
    // Audit parcours réel F6: 12 weeks of base, none of development, 2 of taper; the taper went unnamed.
    [
      "two weeks of taper after a long base: named from the room before it",
      320,
      [12, 0, 6, 2],
      0,
      ["0 Base", null, "192.8 Spécifique", "278 Affût."],
    ],
    // Audit iPhone F4: « Spécifique » whole left no room for the taper's name; « Spé. Affût. » both fit.
    [
      "one week of base: Base hidden, Spé. makes room for the taper",
      320,
      [1, 9, 4, 2],
      1,
      [null, "23.3 Développement", "200.5 Spé.", "264 Affûtage"],
    ],
  ])("%s", (_, width, weeks, current, expected) => {
    expect(layout(width, weeks, current)).toEqual(expected);
  });
});
