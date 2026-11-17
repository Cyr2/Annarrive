import { cx } from "../../lib/cx.ts";
import { Icon } from "../../ui/Icon.tsx";
import { PaceValue } from "../../ui/PaceValue.tsx";
import { TONES, type Tone } from "../../ui/tones.ts";

/** The type's color as a halo in the top corner, gone by mid card: the session reads at a glance and the numbers sit on calm. */
export function ToneWash({ tone }: { tone: Tone }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "pointer-events-none absolute inset-0 [mask-image:radial-gradient(120%_70%_at_100%_0%,black,transparent_60%)]",
        TONES[tone].wash,
      )}
    />
  );
}

type FigureProps = {
  label: string;
  value: string;
  unit?: string;
  size?: "figure" | "num";
  /** Right-aligned, for the last figure of a row. */
  end?: boolean;
  rolling?: boolean;
};

/** A labelled number of a card (inside a `dl`): the label small above, the value big and tabular. */
export function Figure({ label, value, unit, size = "num", end = false, rolling }: FigureProps) {
  return (
    <div className={cx("flex min-w-0 flex-col", end && "ml-auto items-end text-right")}>
      <dt className="t-cap">{label}</dt>
      <dd className="m-0">
        <PaceValue value={value} unit={unit} size={size} rolling={rolling} />
      </dd>
    </div>
  );
}

/** Reggie's face: his green disc and his bubble icon, glowing at the larger size. Decorative, his name is always written next to it. */
export function ReggieAvatar({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "flex flex-none items-center justify-center rounded-full bg-reggie text-on-color",
        size === "sm" ? "size-7" : "size-10 shadow-glow-reggie",
      )}
    >
      <Icon name="reggie" size={size === "sm" ? 15 : 20} stroke={2.2} />
    </span>
  );
}
