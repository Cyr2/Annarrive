import { cx } from "../lib/cx.ts";
import { Icon, type IconName } from "./Icon.tsx";

type Props = { label: string; icon: IconName; main?: boolean; onClick: () => void };

/** The 60 px round actions under the session: Reggie in blue, the others in glass. */
export function RoundAction({ label, icon, main = false, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press t-cap flex flex-col items-center gap-2 border-0 bg-transparent p-0 font-semibold text-text"
    >
      <span
        className={cx(
          "flex size-15 items-center justify-center rounded-full",
          main ? "bg-assistant text-on-accent shadow-accent" : "glass text-text",
        )}
      >
        <Icon name={icon} />
      </span>
      {label}
    </button>
  );
}
