import type { Program } from "../../api/schemas.ts";
import { daysBetween, weekRange } from "../../lib/date.ts";
import { ChoiceCard } from "../../ui/ChoiceCard.tsx";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { Switch } from "../../ui/controls.tsx";
import { DayChips, toggled } from "../../ui/DayChips.tsx";
import { Group, RowButton, RowInput, RowSelect, Section } from "../../ui/List.tsx";
import { TITLE_MAX } from "./add.ts";
import { type WorkForm as Form, upcomingMondays, WORK_REPEATS } from "./work.ts";

type Props = { form: Form; today: string; onChange: (patch: Partial<Form>) => void; onPickWeeks: () => void };

export const weeksCount = (n: number) => (n > 1 ? `${n} semaines` : `${n} semaine`);
/** The weeks step's button: « OK, 4 semaines ». */
export const weeksDone = (n: number) => (n === 0 ? "Choisis au moins une semaine" : `OK, ${weeksCount(n)}`);

/** Travail (variant 1, a rule): title, days, hours, how it repeats, and whether she stays on her feet. */
export function WorkForm({ form, today, onChange: set, onPickWeeks }: Props) {
  return (
    <>
      <Group>
        <RowInput
          label="Titre"
          maxLength={TITLE_MAX}
          placeholder="Ex. : Coaching"
          value={form.title}
          onChange={(title) => set({ title })}
        />
      </Group>
      <Section title="Jours">
        <DayChips label="Jours" selected={form.days} onToggle={(day) => set({ days: toggled(form.days, day) })} />
      </Section>
      <Group>
        <RowInput label="Début" type="time" value={form.start} onChange={(start) => set({ start })} />
        <RowInput label="Fin" type="time" value={form.end} onChange={(end) => set({ end })} />
      </Group>
      <Group>
        <RowSelect label="Répéter" value={form.repeat} options={WORK_REPEATS} onChange={(repeat) => set({ repeat })} />
        {form.repeat === "weekly" && (
          <RowInput
            label="Jusqu'au"
            type="date"
            min={today}
            value={form.until}
            display={form.until ? undefined : "Sans fin"}
            onChange={(until) => set({ until })}
          />
        )}
        {form.repeat === "weeks" && (
          <RowButton label="Semaines" value={weeksCount(form.weeks.length)} onClick={onPickWeeks} />
        )}
      </Group>
      <PhysicalSwitch legs={form.legs} onChange={(legs) => set({ legs })} />
    </>
  );
}

/** « Travail physique »: like a legs session, it keeps a hard run away from just before it that day (H6). */
export function PhysicalSwitch({ legs, onChange }: { legs: boolean; onChange: (legs: boolean) => void }) {
  return (
    <Section footnote="Le jour même, Reggie ne met pas de séance dure juste avant.">
      <Group>
        <div className="row">
          <span id="work-legs-label" className="t-body">
            Travail physique
          </span>
          <Switch checked={legs} onChange={onChange} labelledBy="work-legs-label" />
        </div>
      </Group>
    </Section>
  );
}

type WeeksProps = {
  selected: string[];
  today: string;
  program: Program | undefined;
  onToggle: (monday: string) => void;
};

/** « Quelles semaines ? »: the coming weeks to tick, with their number in the programme when there is one. */
export function WeeksStep({ selected, today, program, onToggle }: WeeksProps) {
  const mondays = upcomingMondays(today);
  const first = mondays[0] ?? today;
  const numbered = program && !program.maintenance && program.weekIndex > 0;
  return (
    <>
      <ChoiceGroup label="Semaines" className="flex flex-col gap-2">
        {mondays.map((monday) => {
          const index = numbered ? program.weekIndex + daysBetween(first, monday) / 7 : 0;
          return (
            <ChoiceCard key={monday} on={selected.includes(monday)} onClick={() => onToggle(monday)}>
              <span className="flex min-w-0 flex-col">
                <span className="t-body">{weekRange(monday)}</span>
                {numbered && index <= program.weekTotal && <span className="t-cap">Semaine {index}</span>}
              </span>
            </ChoiceCard>
          );
        })}
      </ChoiceGroup>
      {numbered && <p className="t-cap m-0 px-4">Les numéros sont ceux de ton programme.</p>}
    </>
  );
}
