import { useState } from "react";
import type { CalendarEvent } from "../../api/schemas.ts";
import { dayTitle, minutesOf, span } from "../../lib/date.ts";
import { Button } from "../../ui/Button.tsx";
import { Group, RowInput, Section } from "../../ui/List.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { findItem, todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import type { SheetProps } from "../sheets/SheetHost.tsx";

const TITLES = { class: "Cours", revision: "Révision", busy: "Indispo", strength: "Muscu" } as const;

/** A class (read only, "Ce cours n'a pas lieu"), a revision or a busy slot (day and time can change). */
export default function EventSheet({ spec, ...sheet }: SheetProps<"event">) {
  const plan = usePlan();
  const item = findItem(plan, spec.id);
  if (!item || item.kind === "run") return null;
  return item.kind === "class" ? (
    <ClassCard event={item} {...sheet} />
  ) : (
    <EditEvent event={item} today={todayOf(plan)} {...sheet} />
  );
}

type Props = Omit<SheetProps<"event">, "spec"> & { event: CalendarEvent };

function ClassCard({ event, ...sheet }: Props) {
  const apply = usePlan((s) => s.apply);
  const toggle = async () => {
    const done = await apply((api) => api.updateEvent(event.id, { cancelled: !event.cancelled }));
    if (done) sheet.onOpenChange(false);
  };
  return (
    <Sheet {...sheet} title={event.title} cancelLabel="Fermer">
      <Group>
        <div className="row">
          <span className="t-body">Jour</span>
          <span className="t-body text-text-secondary">{dayTitle(event.date)}</span>
        </div>
        <div className="row">
          <span className="t-body">Horaire</span>
          <span className="t-body text-text-secondary">{span(event.start, event.end)}</span>
        </div>
      </Group>
      <p className="t-cap m-0 px-4">
        Vient de ton emploi du temps, qui se relit tout seul. Un cours ne se déplace pas, mais tu peux dire qu'il n'a
        pas lieu : le créneau se libère.
      </p>
      <Button variant={event.cancelled ? "tinted" : "primary"} onClick={() => void toggle()}>
        {event.cancelled ? "Le cours a lieu finalement" : "Ce cours n'a pas lieu"}
      </Button>
    </Sheet>
  );
}

function EditEvent({ event, today, ...sheet }: Props & { today: string }) {
  const apply = usePlan((s) => s.apply);
  const [draft, setDraft] = useState({ title: event.title, date: event.date, start: event.start, end: event.end });
  const valid = Boolean(draft.date && draft.start && draft.end) && minutesOf(draft.start) < minutesOf(draft.end);
  const run = async (action: Parameters<typeof apply>[0]) => {
    if (await apply(action)) sheet.onOpenChange(false);
  };
  return (
    <Sheet
      {...sheet}
      title={TITLES[event.kind]}
      action={{ label: "OK", disabled: !valid, onClick: () => void run((api) => api.updateEvent(event.id, draft)) }}
    >
      <Group>
        {event.kind === "busy" && (
          <RowInput label="Titre" value={draft.title} onChange={(title) => setDraft({ ...draft, title })} />
        )}
        <RowInput
          label="Jour"
          type="date"
          min={today}
          value={draft.date}
          onChange={(date) => setDraft({ ...draft, date })}
        />
        <RowInput label="Début" type="time" value={draft.start} onChange={(start) => setDraft({ ...draft, start })} />
        <RowInput label="Fin" type="time" value={draft.end} onChange={(end) => setDraft({ ...draft, end })} />
      </Group>
      <Section footnote="Si une course tombe sur ce créneau, Reggie la déplace et te le dit.">
        <Group>
          <Button variant="danger" onClick={() => void run((api) => api.deleteEvent(event.id, "one", event.date))}>
            Supprimer
          </Button>
        </Group>
      </Section>
    </Sheet>
  );
}
