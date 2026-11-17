import { useId } from "react";
import { Switch } from "../../ui/controls.tsx";

type Props = { title: string; detail?: string; checked: boolean; onChange: (on: boolean) => void };

/** A grouped list row with a switch: the setting, what it does in one line under it. */
export function SwitchRow({ title, detail, checked, onChange }: Props) {
  const id = useId();
  return (
    <div className="row py-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span id={id} className="t-body">
          {title}
        </span>
        {detail && <span className="t-cap">{detail}</span>}
      </span>
      <Switch checked={checked} onChange={onChange} labelledBy={id} />
    </div>
  );
}
