import { useEffect, useState } from "react";
import { mondayOf } from "../../lib/date.ts";
import { Segmented } from "../../ui/Segmented.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import type { SheetProps } from "../sheets/SheetHost.tsx";
import { EventForm } from "./EventForm.tsx";
import { StrengthList } from "./StrengthList.tsx";

type Kind = "strength" | "revision" | "busy";

const KINDS: { value: Kind; label: string }[] = [
  { value: "strength", label: "Muscu" },
  { value: "revision", label: "Révision" },
  { value: "busy", label: "Indispo" },
];

/** The + of the week (design/Ajouter): place a strength session, a revision, or a busy slot. */
export default function AddSheet({ spec, ...sheet }: SheetProps<"add">) {
  const plan = usePlan();
  const [kind, setKind] = useState<Kind>("strength");
  const today = todayOf(plan);
  const date = spec.date && spec.date >= today ? spec.date : today;

  useEffect(() => {
    if (!usePlan.getState().program) void usePlan.getState().loadProgram();
  }, []);

  return (
    <Sheet {...sheet} title="Ajouter">
      <Segmented label="Type" items={KINDS} value={kind} onChange={setKind} />
      {kind === "strength" && (
        <StrengthList
          templates={plan.program?.strength ?? []}
          monday={mondayOf(date)}
          today={today}
          close={() => sheet.onOpenChange(false)}
        />
      )}
      {kind !== "strength" && (
        <EventForm key={kind} kind={kind} date={date} today={today} close={() => sheet.onOpenChange(false)} />
      )}
    </Sheet>
  );
}
