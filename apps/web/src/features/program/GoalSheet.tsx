import { RACE_NAME_MAX } from "@annarrive/protocol";
import { useState } from "react";
import type { GoalInput } from "../../api/client.ts";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { Button, Chip, SegmentedControl } from "../../ui/controls.tsx";
import { Group, RowInput, Section } from "../../ui/List.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { TimeBoxes } from "../../ui/TimeBoxes.tsx";
import { todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import type { SheetProps } from "../sheets/SheetHost.tsx";
import { goalSummary, RACES } from "./goal.ts";
import { secondsOf } from "./program.ts";

const MODES = [
  { value: "time", label: "Viser un chrono" },
  { value: "finish", label: "Juste finir" },
];

/** "1:48:00" with hours always written, so the server never reads "48:00" as 48 hours. */
const fullClock = (seconds: number) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(seconds / 3600)}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
};

/** Modifier l'objectif: her race, date and target in h and min boxes, or "Juste finir". What changes comes before Valider. */
export default function GoalSheet(sheet: SheetProps<"goal">) {
  const plan = usePlan();
  const goal = plan.program?.goal;
  const [draft, setDraft] = useState<GoalInput | undefined>(goal && { ...goal });
  const [finish, setFinish] = useState(!goal?.targetTime);
  if (!goal || !draft) return null;
  const set = (patch: Partial<GoalInput>) => setDraft({ ...draft, ...patch });
  const seconds = secondsOf(draft.targetTime);
  const input = { ...draft, targetTime: finish || seconds === 0 ? undefined : draft.targetTime };
  const save = async () => {
    if (await plan.apply((api) => api.updateGoal(input))) sheet.onOpenChange(false);
  };
  return (
    <Sheet
      {...sheet}
      title="Ton objectif"
      footer={
        <Button
          variant="filled"
          size="large"
          disabled={!draft.date || (!finish && seconds === 0)}
          onClick={() => void save()}
        >
          Valider
        </Button>
      }
    >
      <Section title="Course">
        <ChoiceGroup label="Course" className="flex flex-wrap gap-2">
          {RACES.map((r) => (
            <Chip key={r.race} selected={draft.race === r.race} onClick={() => set({ race: r.race, distanceKm: r.km })}>
              {r.race}
            </Chip>
          ))}
        </ChoiceGroup>
      </Section>
      <Group>
        <RowInput
          label="Nom de la course"
          placeholder="Semi de Strasbourg"
          maxLength={RACE_NAME_MAX}
          value={draft.name ?? ""}
          onChange={(name) => set({ name })}
        />
        <RowInput label="Date" type="date" min={todayOf(plan)} value={draft.date} onChange={(date) => set({ date })} />
        <RowInput
          label="Heure de départ"
          type="time"
          value={draft.startTime ?? "9:00"}
          onChange={(startTime) => set({ startTime })}
        />
      </Group>
      <Section
        title="Ton chrono"
        footnote="C'est toi qui le choisis. Sans chrono, l'objectif est de finir, à ton rythme."
      >
        <SegmentedControl
          label="Ton chrono"
          items={MODES}
          value={finish ? "finish" : "time"}
          onChange={(mode) => setFinish(mode === "finish")}
        />
        {!finish && <TimeBoxes seconds={seconds} onChange={(s) => set({ targetTime: fullClock(s) })} />}
      </Section>
      <Section title="Ce qui change">
        <Surface variant="inset" className="p-4">
          <span className="t-body">{goalSummary(goal, input, todayOf(plan))}</span>
        </Surface>
      </Section>
    </Sheet>
  );
}
