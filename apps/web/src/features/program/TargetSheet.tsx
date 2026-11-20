import { Sheet } from "../../ui/Sheet.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { usePlan } from "../plan/store.ts";
import { TalkLink } from "../reggie/TalkLink.tsx";
import type { SheetProps } from "../sheets/SheetHost.tsx";
import { QUESTIONS, targetReasons } from "./TargetTag.tsx";

/** « Pourquoi atteignable ? » or « ambitieux » (design/Programme): what the verdict on her target rests on. */
export default function TargetSheet(sheet: SheetProps<"target">) {
  const goal = usePlan((s) => s.program?.goal);
  const kind = goal?.targetTag;
  const why = goal?.targetWhy;
  if (!goal || !kind || !why) return null;
  return (
    <Sheet
      {...sheet}
      title={kind === "ambitious" ? "Pourquoi ambitieux ?" : "Pourquoi atteignable ?"}
      cancelLabel="Fermer"
    >
      <Surface variant="inset" className="flex flex-col gap-3 px-4 py-4">
        {targetReasons(kind, why).map((line) => (
          <p key={line} className="t-body m-0">
            {line}
          </p>
        ))}
      </Surface>
      <TalkLink
        context={goal.targetTime ? `${goal.race}, ${goal.targetTime}` : goal.race}
        about={{ screen: "program" }}
        question={QUESTIONS[kind]}
        onGo={() => sheet.onOpenChange(false)}
      />
    </Sheet>
  );
}
