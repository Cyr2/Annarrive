import { Button } from "./controls.tsx";
import type { IconName } from "./Icon.tsx";

type Props = { label: string; icon: IconName; reggie?: boolean; onClick: () => void };

/**
 * The 60 px round actions under the session, in glass. Reggie's is the only filled one, in his green: it is
 * the way to him, not the screen's main action.
 */
export function RoundAction({ label, icon, reggie = false, onClick }: Props) {
  return (
    <span className="t-cap flex flex-col items-center gap-2 font-semibold">
      <Button
        icon={icon}
        aria-label={label}
        variant={reggie ? "filled" : "glass"}
        tone={reggie ? "reggie" : undefined}
        size="round"
        onClick={onClick}
      />
      <span aria-hidden="true">{label}</span>
    </span>
  );
}
