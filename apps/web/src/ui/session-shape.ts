/** One bar of a session's shape: its height (0 to 1) and its share of the width. */
export type Bar = { level: number; weight: number };

type StepLike = { label: string; tone: "plain" | "hard" | "muted" };

const LEVEL = { hard: 1, plain: 0.52, muted: 0.3 } as const;
const MAX_REPEATS = 12;

/** "15 min" → 15, "1 h 10 en endurance" → 70, "1 h" → 60; nothing when the label has no duration. */
export function minutesIn(label: string): number | undefined {
  const hours = /(\d+)\s*h(?:\s*(\d+))?/.exec(label);
  if (hours) return Number(hours[1]) * 60 + Number(hours[2] ?? 0);
  const minutes = /(\d+)\s*min/.exec(label);
  return minutes ? Number(minutes[1]) : undefined;
}

/** "6 × 800 m" → 6, "6 lignes droites" → 6. */
function repeatsIn(label: string): number | undefined {
  const match = /^(\d+)\s*(?:×|x\b|lignes?|fois)/.exec(label);
  return match ? Math.min(Number(match[1]), MAX_REPEATS) : undefined;
}

/**
 * The session drawn as bars: warm-up, the blocks, cool-down. A repeated block becomes one bar per repeat,
 * with the recovery that follows it drawn low between them. Widths follow the minutes when the label says them.
 */
export function shapeOf(steps: StepLike[]): Bar[] {
  const bars: Bar[] = [];
  for (const [i, step] of steps.entries()) {
    const previous = steps[i - 1];
    // A recovery without duration was drawn between the repeats of the block before it.
    if (previous && isGap(step) && blocksOf(previous).some((block) => (repeatsIn(block.label) ?? 0) > 1)) continue;
    for (const block of blocksOf(step)) {
      const repeats = repeatsIn(block.label) ?? 1;
      const minutes = minutesIn(block.label);
      if (repeats > 1) bars.push(...repeated(block, repeats, steps[i + 1]));
      else bars.push({ level: LEVEL[block.tone], weight: minutes ? Math.min(Math.max(minutes / 5, 1), 8) : 2 });
    }
  }
  return bars;
}

/** "10 × 400 m + 5 × 200 m" is two blocks in one step: each is drawn. */
const blocksOf = (step: StepLike): StepLike[] => step.label.split(/\s*\+\s*/).map((label) => ({ ...step, label }));

const isGap = (step: StepLike) => step.tone === "muted" && minutesIn(step.label) === undefined;

function repeated(step: StepLike, repeats: number, next: StepLike | undefined): Bar[] {
  const gap = next && isGap(next);
  return Array.from({ length: repeats }, (_, k): Bar[] => [
    ...(k > 0 && gap ? [{ level: LEVEL.muted, weight: 0.4 }] : []),
    { level: LEVEL[step.tone], weight: 0.55 },
  ]).flat();
}
