import { useState } from "react";
import type { CalendarEvent } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { dayTitle, minutesOf, span } from "../../lib/date.ts";
import { classTitle } from "../../lib/text.ts";
import { IconTile } from "../../ui/bits.tsx";
import { ConfirmDialog } from "../../ui/ConfirmDialog.tsx";
import { Button } from "../../ui/controls.tsx";
import { Group, RowInput, Section } from "../../ui/List.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { TextButton } from "../../ui/TextButton.tsx";
import { isValidSpan, TITLE_MAX } from "../add/add.ts";
import { PhysicalSwitch } from "../add/WorkForm.tsx";
import { findItem, todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import type { SheetProps } from "../sheets/SheetHost.tsx";

const TITLES = { class: "Cours", revision: "Révision", busy: "Occupée", strength: "Muscu", work: "Travail" } as const;

/** A class (read only, "Ce cours n'a pas lieu"), a revision or a busy slot (day and time can change). */
export default function EventSheet({ spec, ...sheet }: SheetProps<"event">) {
  const plan = usePlan();
  const item = findItem(plan, spec.id);
  if (!item || item.kind === "run") return null;
  if (item.kind === "work") return <EditWork event={item} {...sheet} />;
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
  const { title, detail } = classTitle(event.title);
  return (
    <Sheet
      {...sheet}
      title={title}
      subtitle={detail}
      cancelLabel="Fermer"
      footer={
        <Button variant="tinted" size="large" onClick={() => void toggle()}>
          {event.cancelled ? "Le cours a lieu finalement" : "Ce cours n'a pas lieu"}
        </Button>
      }
    >
      <Surface variant="inset" className="flex items-center gap-3 px-4 py-3">
        <IconTile tone="class" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="t-strong">{dayTitle(event.date)}</span>
          <span className={cx("t-cap", event.cancelled && "line-through")}>{span(event.start, event.end)}</span>
        </span>
        {event.cancelled && <span className="t-cap flex-none rounded-full bg-fill px-2 py-0.5">N'a pas lieu</span>}
      </Surface>
      {detail && <p className="t-sub m-0 px-4 break-words">Nom complet : {event.title.trim()}</p>}
      <p className="t-cap m-0 px-4">
        Vient de ton emploi du temps, qui se relit tout seul. Un cours ne se déplace pas. S'il n'a pas lieu, dis-le : le
        créneau se libère et Reggie peut adapter ta semaine.
      </p>
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

/**
 * Her work, one occurrence tapped: title, hours and « Travail physique » change the whole rule, its days stay.
 * Supprimer asks which weeks in the one alert, as muscu does.
 */
function EditWork({ event, ...sheet }: Props) {
  const apply = usePlan((s) => s.apply);
  const [draft, setDraft] = useState({ title: event.title, start: event.start, end: event.end, legs: !!event.legs });
  const [confirm, setConfirm] = useState(false);
  const run = async (action: Parameters<typeof apply>[0]) => {
    if (await apply(action)) sheet.onOpenChange(false);
  };
  const { title, legs, start, end } = draft;
  const save = () =>
    void run((api) => api.updateEvent(event.id, { title: title.trim() || "Travail", legs, hours: { start, end } }));
  return (
    <Sheet
      {...sheet}
      title={event.title}
      subtitle={`${dayTitle(event.date)}, ${span(event.start, event.end)}`}
      action={{ label: "OK", disabled: !isValidSpan(start, end), onClick: save }}
      footer={
        <Group>
          <TextButton tone="danger" className="min-h-13 w-full" onClick={() => setConfirm(true)}>
            Supprimer
          </TextButton>
          <ConfirmDialog
            open={confirm}
            onClose={() => setConfirm(false)}
            title={`Supprimer ${event.title} ?`}
            actions={[
              {
                label: "Cette semaine et les suivantes",
                onClick: () => void run((api) => api.deleteEvent(event.id, "following", event.date)),
              },
              {
                label: "Cette semaine seulement",
                onClick: () => void run((api) => api.deleteEvent(event.id, "one", event.date)),
              },
            ]}
          />
        </Group>
      }
    >
      <Group>
        <RowInput
          label="Titre"
          maxLength={TITLE_MAX}
          value={title}
          onChange={(v) => setDraft({ ...draft, title: v })}
        />
      </Group>
      <Section footnote="Les nouvelles heures valent pour chaque semaine de ce travail.">
        <Group>
          <RowInput label="Début" type="time" value={start} onChange={(v) => setDraft({ ...draft, start: v })} />
          <RowInput label="Fin" type="time" value={end} onChange={(v) => setDraft({ ...draft, end: v })} />
        </Group>
      </Section>
      <PhysicalSwitch legs={legs} onChange={(v) => setDraft({ ...draft, legs: v })} />
    </Sheet>
  );
}
