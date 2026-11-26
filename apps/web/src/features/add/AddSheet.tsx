import { useEffect, useState } from "react";
import type { Slot, Strength } from "../../api/schemas.ts";
import { mondayOf, weekday } from "../../lib/date.ts";
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
import { WeeksStep, WorkForm, weeksDone } from "./WorkForm.tsx";
import { isValidWork, type WorkForm as Work, workEvents } from "./work.ts";

type Kind = "strength" | "revision" | "work" | "busy";

const KINDS: { value: Kind; label: string }[] = [
  { value: "strength", label: "Muscu" },
  { value: "revision", label: "Révision" },
  { value: "work", label: "Travail" },
  { value: "busy", label: "Occupée" },
];

/**
 * The + of the week (design/Ajouter): place a strength session (a pushed step, prefilled on her habit), a
 * revision, her work, or a busy slot. The one main action sits in the footer and says what it adds.
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
  const [work, setWork] = useState<Work>({
    title: "",
    days: [weekday(date)],
    start: "14:00",
    end: "18:00",
    repeat: "weekly",
    until: "",
    weeks: [mondayOf(date)],
    legs: false,
  });
  const [placing, setPlacing] = useState<{ template: Strength; slot: Slot }>();
  const [pickingWeeks, setPickingWeeks] = useState(false);

  useEffect(() => {
    if (!usePlan.getState().program) void usePlan.getState().loadProgram();
  }, []);

  const add = async (event: Parameters<typeof plan.apply>[0]) => {
    if (await plan.apply(event)) sheet.onOpenChange(false);
  };

  if (pickingWeeks)
    return (
      <Sheet
        {...sheet}
        title="Quelles semaines ?"
        onBack={() => setPickingWeeks(false)}
        step={1}
        footer={
          <Button
            variant="filled"
            size="large"
            disabled={work.weeks.length === 0}
            onClick={() => setPickingWeeks(false)}
          >
            {weeksDone(work.weeks.length)}
          </Button>
        }
      >
        <WeeksStep
          selected={work.weeks}
          today={today}
          program={plan.program}
          onToggle={(monday) => setWork({ ...work, weeks: toggledWeek(work.weeks, monday) })}
        />
      </Sheet>
    );

  if (placing) {
    const { template, slot } = placing;
    return (
      <Sheet
        {...sheet}
        title="Placer"
        subtitle={template.name}
        onBack={() => setPlacing(undefined)}
        step={1}
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

  const action = kind === "strength" ? undefined : addAction(kind, form, work, date, today);
  const footer = action && (
    <Button
      variant="filled"
      size="large"
      disabled={!action.valid}
      onClick={() => void add((api) => api.addEvent(action.events()))}
    >
      {action.label}
    </Button>
  );
  return (
    <Sheet {...sheet} title="Ajouter" footer={footer}>
      <SegmentedControl label="Type" items={KINDS} value={kind} onChange={setKind} />
      {kind === "strength" ? (
        <StrengthList
          templates={plan.program?.strength ?? []}
          onPlace={(template) =>
            setPlacing({ template, slot: { date: usualDate(template, mondayOf(date), today), start: template.start } })
          }
        />
      ) : kind === "work" ? (
        <WorkForm
          form={work}
          today={today}
          onChange={(patch) => setWork({ ...work, ...patch })}
          onPickWeeks={() => setPickingWeeks(true)}
        />
      ) : (
        <EventForm kind={kind} form={form} today={today} onChange={(patch) => setForm({ ...form, ...patch })} />
      )}
    </Sheet>
  );
}

/** The footer's one action for a form: what it says, whether it can be pressed, and what it adds. */
function addAction(kind: Exclude<Kind, "strength">, form: Form, work: Work, date: string, today: string) {
  if (kind === "work")
    return {
      label: "Ajouter le travail",
      valid: isValidWork(work, date, today),
      events: () => workEvents(work, date, today),
    };
  return {
    label: kind === "revision" ? "Ajouter la révision" : "Ajouter le créneau",
    valid: isValidForm(kind, form),
    events: () => (kind === "revision" ? revisionEvent(form) : busyEvent(form)),
  };
}

/** The Mondays with `monday` added or taken out. */
const toggledWeek = (weeks: string[], monday: string) =>
  weeks.includes(monday) ? weeks.filter((w) => w !== monday) : [...weeks, monday].sort();
