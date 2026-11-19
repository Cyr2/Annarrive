import { PRIVACY_NOTE } from "@annarrive/protocol";
import { useEffect, useId } from "react";
import { Icon } from "../../ui/Icon.tsx";
import { Group, Section } from "../../ui/List.tsx";
import { SwitchRow } from "../program/SwitchRow.tsx";
import { PainStep as PainLevel, ZoneStep } from "../unavailable/steps.tsx";
import { Notifications } from "./Notifications.tsx";
import { BigChoice, Card, update, useDraft } from "./parts.tsx";
import { useOnboarding } from "./store.ts";

/** Pain first (it shapes the first week), then what the app may read on her watch. */
export function HealthStep() {
  const draft = useDraft();
  return (
    <>
      <Section title="Une douleur en ce moment ?">
        <div className="flex flex-col gap-2">
          <BigChoice label="Non, tout va bien" on={!draft.pain} onClick={() => update({ pain: false })} />
          <BigChoice
            label="Oui, quelque chose me gêne"
            detail="Ton plan démarre en douceur."
            on={draft.pain}
            onClick={() => update({ pain: true })}
          />
        </div>
      </Section>
      {draft.pain && <ZoneStep zone={draft.zone} onChange={(zone) => update({ zone })} />}
      {draft.pain && draft.zone && (
        <PainLevel pain={draft.level} zone={draft.zone} onChange={(level) => update({ level })} />
      )}
      <Section title="Ce qu'Annarrivé lit" footnote={PRIVACY_NOTE}>
        <Group>
          <SwitchRow
            title="Sommeil et fréquence cardiaque"
            detail="Lus sur ta Garmin, pour alléger une séance après une mauvaise nuit."
            checked={draft.useSleepHr}
            onChange={(useSleepHr) => update({ useSleepHr })}
          />
          <SwitchRow
            title="Cycle menstruel"
            detail="Tu peux signaler un symptôme à Reggie, qui en tient compte comme d'une fatigue. Tes séances ne suivent jamais la phase du cycle."
            checked={draft.cycleTracking}
            onChange={(cycleTracking) => update({ cycleTracking })}
          />
        </Group>
      </Section>
    </>
  );
}

function Timetable() {
  const linked = useOnboarding((s) => s.linked);
  const draft = useDraft();
  const id = useId();
  useEffect(() => void useOnboarding.getState().checkTimetable(), []);
  if (linked === undefined) return <p className="t-sub m-0 px-4">Vérification de ton emploi du temps.</p>;
  if (linked)
    return (
      <Card className="flex-row items-start">
        <Icon name="checkCircle" className="mt-px flex-none text-ok-deep" />
        <p className="t-body m-0">Ton emploi du temps est relié. Tes courses se placent autour de tes cours.</p>
      </Card>
    );
  return (
    <Section footnote="Pas encore relié. Colle le lien ICS de ton emploi du temps, ou fais-le plus tard dans Programme.">
      <Group>
        <label htmlFor={id} className="row field-ring">
          <span className="sr-only-label">Lien de l'emploi du temps</span>
          <input
            id={id}
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Ex. : https://ent.univ.fr/agenda.ics"
            value={draft.icsUrl}
            onChange={(e) => update({ icsUrl: e.target.value })}
            className="t-body min-h-11 w-full min-w-0 truncate border-0 bg-transparent text-left text-ink outline-none placeholder:text-ink-3"
          />
        </label>
      </Group>
    </Section>
  );
}

export function ConnectStep() {
  return (
    <>
      <Section title="Emploi du temps">
        <Timetable />
      </Section>
      <Notifications />
    </>
  );
}
