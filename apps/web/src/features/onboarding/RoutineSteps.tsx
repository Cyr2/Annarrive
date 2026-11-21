import { useEffect, useId } from "react";
import { SegmentedControl } from "../../ui/controls.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Group, RowDuration, RowInput } from "../../ui/List.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { TextButton } from "../../ui/TextButton.tsx";
import { Ask, ProfileDays, update, useDraft } from "./parts.tsx";
import { useOnboarding } from "./store.ts";

const RUNS = [
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
] as const;

export function WeekStep() {
  const { runsPerWeek, longRunDays, preferredHour } = useDraft();
  return (
    <>
      <Ask question="Combien de courses par semaine ?">
        <SegmentedControl
          label="Courses par semaine"
          items={[...RUNS]}
          value={RUNS.find((r) => Number(r.value) === runsPerWeek)?.value}
          onChange={(n) => update({ runsPerWeek: n === "3" ? 3 : n === "4" ? 4 : 5 })}
        />
      </Ask>
      <Ask question="Ta sortie longue, plutôt quel jour ?">
        <ProfileDays
          label="Jours de sortie longue"
          value={longRunDays}
          onChange={(days) => update({ longRunDays: days })}
        />
      </Ask>
      <Ask
        question="À quelle heure aimes-tu courir ?"
        help={
          preferredHour
            ? "Reggie place tes courses autour de cette heure quand c'est possible."
            : "Reggie suit l'heure où tu cours d'habitude."
        }
      >
        <Group>
          <RowInput
            label="Heure préférée"
            type="time"
            value={preferredHour}
            display={preferredHour ? undefined : "Automatique"}
            onChange={(time) => update({ preferredHour: time })}
          />
          {preferredHour && (
            <TextButton className="hairline-top min-h-13 w-full" onClick={() => update({ preferredHour: "" })}>
              Revenir à automatique
            </TextButton>
          )}
        </Group>
      </Ask>
    </>
  );
}

/** Her timetable link: already linked by Darius, or pasted here. */
function Timetable() {
  const linked = useOnboarding((s) => s.linked);
  const { icsUrl } = useDraft();
  const id = useId();
  useEffect(() => void useOnboarding.getState().checkTimetable(), []);
  if (linked)
    return (
      <Surface variant="inset" className="flex items-start gap-3 p-4">
        <Icon name="checkCircle" className="mt-px flex-none text-ok-deep" />
        <p className="t-body m-0">Ton emploi du temps est relié.</p>
      </Surface>
    );
  const paste = () =>
    void navigator.clipboard
      .readText()
      .then((text) => update({ icsUrl: text.trim() }))
      .catch(() => undefined);
  return (
    <Group>
      <div className="row field-ring">
        <label htmlFor={id} className="sr-only-label">
          Lien de l'emploi du temps
        </label>
        <input
          id={id}
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Colle le lien de ton agenda"
          value={icsUrl}
          onChange={(e) => update({ icsUrl: e.target.value })}
          className="t-body min-h-11 w-full min-w-0 truncate border-0 bg-transparent text-left text-ink outline-none placeholder:text-ink-3"
        />
        {!icsUrl && "clipboard" in navigator && (
          <TextButton className="flex-none" onClick={paste}>
            Coller
          </TextButton>
        )}
      </div>
    </Group>
  );
}

export function DaysStep() {
  const { bedtime, travelMin } = useDraft();
  return (
    <>
      <Ask question="Ton emploi du temps" help="Reggie lit tes cours et n'y touche jamais.">
        <Timetable />
      </Ask>
      <Ask question="À quelle heure te couches-tu ?">
        <Group>
          <RowInput label="Coucher" type="time" value={bedtime} onChange={(time) => update({ bedtime: time })} />
        </Group>
      </Ask>
      <Ask
        question="Après une course, il te faut combien de temps avant un cours ?"
        help="Pour te doucher, te changer et y aller. Tes courses finissent assez tôt pour ça."
      >
        <Group>
          <RowDuration
            label="Il me faut"
            minutes={travelMin}
            maxHours={2}
            onChange={(minutes) => update({ travelMin: minutes })}
          />
        </Group>
      </Ask>
    </>
  );
}
