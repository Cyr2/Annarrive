type RepeatedStep = { kind: string; reps?: number | undefined };

/** A session's steps as a Garmin workout lists them: single steps, and repeat groups with the steps they repeat. */
export type StepBlock<S> = { kind: "step"; step: S } | { kind: "repeat"; times: number; steps: S[] };

/**
 * The one reading of the stored steps that the app and the watch share, so both show the same workout: a step
 * with `reps` > 1 opens a repeat group, and the recovery right after it (stored with `reps - 1`) goes inside it.
 */
export function stepBlocks<S extends RepeatedStep>(steps: S[]): StepBlock<S>[] {
  const blocks: StepBlock<S>[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step) continue;
    const times = step.reps ?? 1;
    if (times <= 1) {
      blocks.push({ kind: "step", step });
      continue;
    }
    const next = steps[i + 1];
    const inside = next?.kind === "recover" ? [step, next] : [step];
    i += inside.length - 1;
    blocks.push({ kind: "repeat", times, steps: inside });
  }
  return blocks;
}
