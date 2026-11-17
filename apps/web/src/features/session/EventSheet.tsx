import { useState } from "react";
import type { CalendarEvent } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { dayTitle, minutesOf, span } from "../../lib/date.ts";
import { IconTile } from "../../ui/bits.tsx";
import { Button } from "../../ui/controls.tsx";
import { Group, RowInput, Section } from "../../ui/List.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { TextButton } from "../../ui/TextButton.tsx";
import { TITLE_MAX } from "../add/add.ts";
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
      <Surface variant="inset" className="flex items-center gap-3 px-4 py-3">
        <IconTile tone="class" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="t-strong">{dayTitle(event.date)}</span>
          <span className={cx("t-cap", event.cancelled && "line-through")}>{span(event.start, event.end)}</span>
        </span>
        {event.cancelled && <span className="t-cap flex-none rounded-full bg-fill px-2 py-0.5">N'a pas lieu</span>}
      </Surface>
      <p className="t-cap m-0 px-4">
        Vient de ton emploi du temps, qui se relit tout seul. Un cours ne se déplace pas. S'il n'a pas lieu, dis-le : le
        créneau se libère et Reggie peut adapter ta semaine.
      </p>
      <Button variant="tinted" size="large" onClick={() => void toggle()}>
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
          <RowInput
            label="Titre"
            maxLength={TITLE_MAX}
            value={draft.title}
            onChange={(title) => setDraft({ ...draft, title })}
          />
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
          <TextButton
            tone="danger"
            className="min-h-13 w-full"
            onClick={() => void run((api) => api.deleteEvent(event.id, "one", event.date))}
          >
            Supprimer
          </TextButton>
        </Group>
      </Section>
    </Sheet>
  );
}
