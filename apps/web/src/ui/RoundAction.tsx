import { Button } from "./controls.tsx";
import type { IconName } from "./Icon.tsx";

type Props = {
  label: string;
  icon: IconName;
  onClick: () => void;
  /** As the finger lands, before the tap ends: what the action opens can start loading. */
  onPrepare?: () => void;
};

/** The 60 px round actions under the session, in glass. */
export function RoundAction({ label, icon, onClick, onPrepare }: Props) {
  return (
    <span className="t-cap flex flex-col items-center gap-2 font-semibold">
      <Button icon={icon} aria-label={label} variant="glass" size="round" onClick={onClick} onPointerDown={onPrepare} />
      <span aria-hidden="true">{label}</span>
    </span>
  );
}
