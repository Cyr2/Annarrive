import { useState } from "react";
import type { GoalInput } from "../../api/client.ts";
import { Button } from "../../ui/controls.tsx";
import { Group, RowInput, RowSelect } from "../../ui/List.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import type { SheetProps } from "../sheets/SheetHost.tsx";
import { goalSummary, RACES } from "./goal.ts";

/** Modifier l'objectif: her race, date and (optional) target. A summary of what changes comes before Valider. */
export default function GoalSheet(sheet: SheetProps<"goal">) {
  const plan = usePlan();
  const goal = plan.program?.goal;
  const [draft, setDraft] = useState<GoalInput | undefined>(goal && { ...goal });
  if (!goal || !draft) return null;
  const set = (patch: Partial<GoalInput>) => setDraft({ ...draft, ...patch });
  const validTime = !draft.targetTime || /^\d{1,2}:\d{2}(:\d{2})?$/.test(draft.targetTime);
  const save = async () => {
    const input = { ...draft, targetTime: draft.targetTime || undefined };
    if (await plan.apply((api) => api.updateGoal(input))) sheet.onOpenChange(false);
  };
  return (
    <Sheet
      {...sheet}
      title="Ton objectif"
      footer={
        <Button variant="filled" size="large" disabled={!validTime || !draft.date} onClick={() => void save()}>
          Valider
        </Button>
      }
    >
      <Group>
        <RowSelect
          label="Course"
          value={draft.race}
          options={RACES.map((r) => ({ value: r.race, label: r.race }))}
          onChange={(race) => set({ race, distanceKm: RACES.find((r) => r.race === race)?.km ?? draft.distanceKm })}
        />
        <RowInput label="Date" type="date" min={todayOf(plan)} value={draft.date} onChange={(date) => set({ date })} />
        <RowInput
          label="Chrono visé"
          value={draft.targetTime ?? ""}
          placeholder="Facultatif, ex. : 1:48:00"
          onChange={(targetTime) => set({ targetTime })}
        />
      </Group>
      <p className="t-cap m-0 px-4">
        C'est toi qui choisis ton chrono. Sans chrono, l'objectif est de finir, à ton rythme.
      </p>
      <Surface variant="inset" className="flex flex-col gap-1 p-4">
        <span className="t-strong">Ce qui change</span>
        <span className="t-body">{goalSummary(goal, draft)}</span>
      </Surface>
    </Sheet>
  );
}
