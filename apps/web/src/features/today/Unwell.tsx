import { Icon } from "../../ui/Icon.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { TextButton } from "../../ui/TextButton.tsx";
import { usePlan } from "../plan/store.ts";

/** While she is sick or hurt, Aujourd'hui says so, with « Ça va mieux » one tap away (algo.md EV13). */
export function Unwell({ text }: { text: string }) {
  const apply = usePlan((s) => s.apply);
  return (
    <Surface variant="inset" role="status" className="flex min-h-14 items-center gap-3 py-1 pr-1 pl-4">
      <Icon name="info" size={18} className="flex-none text-ink-2" />
      <span className="t-body min-w-0 flex-1 py-2">{text}</span>
      <TextButton className="t-label flex-none px-3" onClick={() => void apply((api) => api.feelBetter())}>
        Ça va mieux
      </TextButton>
    </Surface>
  );
}
