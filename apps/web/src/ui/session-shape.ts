/** One bar of a session's shape: its height (0 to 1), its share of the width, and the kind of effort it draws. */
export type Bar = { level: number; weight: number; kind: Line["tone"] };

type Line = { label: string; tone: "plain" | "hard" | "muted"; minutes?: number };
/** The steps as the list and the watch have them: lines, and repeat groups with the lines they repeat. */
export type ShapeStep = Line | { repeat: number; steps: Line[] };

const LEVEL = { hard: 1, plain: 0.52, muted: 0.3 } as const;
const MAX_REPEATS = 12;

/** "15 min" → 15, "1 h 10 en endurance" → 70, "1 h" → 60; nothing when the label has no duration. */
export function minutesIn(label: string): number | undefined {
  const hours = /(\d+)\s*h(?:\s*(\d+))?/.exec(label);
  if (hours) return Number(hours[1]) * 60 + Number(hours[2] ?? 0);
  const minutes = /(\d+)\s*min/.exec(label);
  return minutes ? Number(minutes[1]) : undefined;
}

/** A long steady part is wide, a short one never vanishes; inside a repeat every pass stays narrow. */
function bar(line: Line, repeated: boolean): Bar {
  const minutes = line.minutes ?? minutesIn(line.label);
  const weight = repeated
    ? Math.min(Math.max((minutes ?? 1) / 4, 0.3), 1)
    : minutes
      ? Math.min(Math.max(minutes / 5, 1), 8)
      : 2;
  return { level: LEVEL[line.tone], weight, kind: line.tone };
}

/**
 * The session drawn as bars, block for block what the watch runs: warm-up, every pass of a repeat group with
 * its recovery low between them, cool-down.
 */
export function shapeOf(steps: ShapeStep[]): Bar[] {
  return steps.flatMap((step) => {
    if (!("repeat" in step)) return [bar(step, false)];
    const passes = Math.min(step.repeat, MAX_REPEATS);
    return Array.from({ length: passes }, (_, k) =>
      // The last recovery of a group is not run: the next step follows the last pass.
      step.steps.filter((line, i) => k < passes - 1 || i === 0 || line.tone !== "muted").map((line) => bar(line, true)),
    ).flat();
  });
}
