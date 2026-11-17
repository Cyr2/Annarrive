import { useEffect, useState } from "react";
import type { Slot, Strength } from "../../api/schemas.ts";
import { mondayOf } from "../../lib/date.ts";
import { Button, SegmentedControl } from "../../ui/controls.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { shortMoment } from "../move/move.ts";
import { todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import type { SheetProps } from "../sheets/SheetHost.tsx";
import { busyEvent, type Form, isValidForm, revisionEvent, strengthEvent, usualDate } from "./add.ts";
import { EventForm } from "./EventForm.tsx";
import { PlaceStep } from "./PlaceStep.tsx";
import { StrengthList } from "./StrengthList.tsx";

type Kind = "strength" | "revision" | "busy";

const KINDS: { value: Kind; label: string }[] = [
  { value: "strength", label: "Muscu" },
  { value: "revision", label: "Révision" },
  { value: "busy", label: "Occupée" },
];

/**
 * The + of the week (design/Ajouter): place a strength session (a pushed step, prefilled on her habit), a
 * revision, or a busy slot. The one main action sits in the footer and says what it adds.
 */
export default function AddSheet({ spec, ...sheet }: SheetProps<"add">) {
  const plan = usePlan();
  const today = todayOf(plan);
  const date = spec.date && spec.date >= today ? spec.date : today;
  const [kind, setKind] = useState<Kind>("strength");
  const [form, setForm] = useState<Form>({
    title: "",
    date,
    start: "14:00",
    end: "18:00",
    minutes: 120,
    repeat: "never",
  });
  const [placing, setPlacing] = useState<{ template: Strength; slot: Slot }>();

  useEffect(() => {
    if (!usePlan.getState().program) void usePlan.getState().loadProgram();
  }, []);

  const add = async (event: Parameters<typeof plan.apply>[0]) => {
    if (await plan.apply(event)) sheet.onOpenChange(false);
  };

  if (placing) {
    const { template, slot } = placing;
    return (
      <Sheet
        {...sheet}
        title="Placer"
        subtitle={template.name}
        onBack={() => setPlacing(undefined)}
        footer={
          <Button
            variant="filled"
            size="large"
            disabled={!slot.date || !slot.start}
            onClick={() => void add((api) => api.addEvent(strengthEvent(template, slot.date, slot.start)))}
          >
            {slot.date && slot.start ? `Ajouter ${shortMoment(slot, today)}` : "Choisis un jour et une heure"}
          </Button>
        }
      >
        <PlaceStep template={template} slot={slot} today={today} onChange={(s) => setPlacing({ template, slot: s })} />
      </Sheet>
    );
  }

  const footer = kind !== "strength" && (
    <Button
      variant="filled"
      size="large"
      disabled={!isValidForm(kind, form)}
      onClick={() => void add((api) => api.addEvent(kind === "revision" ? revisionEvent(form) : busyEvent(form)))}
    >
      {kind === "revision" ? "Ajouter la révision" : "Ajouter le créneau"}
    </Button>
  );
  return (
    <Sheet {...sheet} title="Ajouter" footer={footer || undefined}>
      <SegmentedControl label="Type" items={KINDS} value={kind} onChange={setKind} />
      {kind === "strength" ? (
        <StrengthList
          templates={plan.program?.strength ?? []}
          onPlace={(template) =>
            setPlacing({ template, slot: { date: usualDate(template, mondayOf(date), today), start: template.start } })
          }
        />
      ) : (
        <EventForm kind={kind} form={form} today={today} onChange={(patch) => setForm({ ...form, ...patch })} />
      )}
    </Sheet>
  );
}
