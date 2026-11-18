import { cx } from "../lib/cx.ts";
import { PaceValue } from "./PaceValue.tsx";

type Line = { label: string; pace: string; tone: "plain" | "hard" | "muted" };
type Block = Line | { repeat: number; steps: Line[] };

function StepRow({ step, className }: { step: Line; className: string }) {
  return (
    <li className={className}>
      <span className={cx("t-body", step.tone === "hard" && "font-semibold")}>{step.label}</span>
      <PaceValue value={step.pace} className={cx("text-right", step.tone === "muted" && "text-ink-2!")} />
    </li>
  );
}

/**
 * A session's steps as a Garmin workout lists them: each line its kind, length and pace, and « Répéter n fois »
 * as a tinted group around the lines it repeats, so what she reads is what her watch will run.
 */
export function StepList({
  steps,
  rowClassName,
  className,
}: {
  steps: Block[];
  rowClassName: string;
  className?: string;
}) {
  return (
    <ol className={cx("m-0 list-none p-0", className)}>
      {steps.map((step, i) =>
        "repeat" in step ? (
          // Two groups can repeat the same lines: their place tells them apart.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          <li key={i} className="step-repeat">
            <span className="t-cap font-semibold text-ink">Répéter {step.repeat} fois</span>
            <ol className="m-0 list-none p-0">
              {step.steps.map((line) => (
                <StepRow key={line.label} step={line} className={rowClassName} />
              ))}
            </ol>
          </li>
        ) : (
          // A warm-up and a cool-down can read the same: the place keeps them apart.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          <StepRow key={i} step={step} className={rowClassName} />
        ),
      )}
    </ol>
  );
}
