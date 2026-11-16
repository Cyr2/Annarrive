import { Switch as GlassSwitch } from "glisse";

type Props = { checked: boolean; onChange: (checked: boolean) => void; labelledBy: string; disabled?: boolean };

/** iOS switch from glisse (its thumb lifts into a lens while held). Only used in lazily loaded screens. */
export function Switch({ checked, onChange, labelledBy, disabled }: Props) {
  return (
    <GlassSwitch
      checked={checked}
      onCheckedChange={onChange}
      aria-labelledby={labelledBy}
      disabled={disabled}
      className="ui-switch"
    />
  );
}
