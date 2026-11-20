import { PRIVACY_NOTE } from "@annarrive/protocol";
import { useState } from "react";
import type { Program, Settings } from "../../api/schemas.ts";
import { ConfirmDialog } from "../../ui/ConfirmDialog.tsx";
import { Group, RowButton, Section } from "../../ui/List.tsx";
import { TextButton } from "../../ui/TextButton.tsx";
import { strengthShort } from "../add/add.ts";
import { usePlan } from "../plan/store.ts";
import { NotificationsRow } from "../push/NotificationsRow.tsx";
import { usePush } from "../push/store.ts";
import { useSheet } from "../sheets/store.ts";
import { Hours, LastTime, Runs, Watch } from "./SettingGroups.tsx";
import { SwitchRow } from "./SwitchRow.tsx";
import { TimetableRows } from "./TimetableRow.tsx";

/** The settings of the Programme tab, one group per subject, in the order she is likely to need them. */
export function ProgramSettings({ program }: { program: Program }) {
  const show = useSheet((s) => s.show);
  const push = usePush((s) => s.status);
  const { settings } = program;
  const toggle = (patch: Partial<Settings>) =>
    void usePlan.getState().apply((api) => api.updateSettings(patch), { quiet: true });
  return (
    <>
      <LastTime last={program.lastTime} />
      <Runs settings={settings} />
      <Hours settings={settings} />

      <Section title="Muscu">
        <Group>
          {program.strength.map((t) => (
            <RowButton
              key={t.id}
              label={t.name}
              value={strengthShort(t)}
              onClick={() => show({ kind: "strength", templateId: t.id })}
            />
          ))}
          <RowButton tone="link" label="Ajouter une séance" onClick={() => show({ kind: "strength" })} />
        </Group>
      </Section>

      <Section
        title="Emploi du temps"
        footnote="Il se relit tout seul plusieurs fois par jour. Actualise si un cours vient d'être annulé."
      >
        <Group>
          <TimetableRows program={program} />
        </Group>
      </Section>

      <Watch watch={program.watch} />

      <Section title="Santé et confidentialité" footnote={PRIVACY_NOTE}>
        <Group>
          <SwitchRow
            title="Sommeil et fréquence cardiaque"
            detail="Lus sur ta Garmin, pour alléger une séance après une mauvaise nuit."
            checked={settings.recoveryData}
            onChange={(recoveryData) => toggle({ recoveryData })}
          />
          <SwitchRow
            title="Cycle menstruel"
            detail="Tu peux signaler un symptôme à Reggie. Tes séances ne suivent jamais la phase du cycle."
            checked={settings.cycle}
            onChange={(on) => (on ? show({ kind: "cycle" }) : toggle({ cycle: false }))}
          />
        </Group>
      </Section>

      {push !== "loading" && push !== "hidden" && (
        <Section
          title="Notifications"
          footnote="Ta semaine le dimanche soir, une course déplacée quand un cours change, et un mot pour Reggie après chaque course."
        >
          <Group>
            <NotificationsRow />
          </Group>
        </Section>
      )}

      {!program.maintenance && <StopRow race={program.goal.race} />}
    </>
  );
}

/** Arrêter ce programme: confirmed in an alert, then maintenance mode. */
function StopRow({ race }: { race: string }) {
  const [asking, setAsking] = useState(false);
  return (
    <Group className="mt-2">
      <TextButton tone="danger" className="min-h-13 w-full" onClick={() => setAsking(true)}>
        Arrêter ce programme
      </TextButton>
      <ConfirmDialog
        open={asking}
        onClose={() => setAsking(false)}
        title={`Arrêter ton plan ${race.toLowerCase()} ?`}
        message="Tu passes en mode entretien : 2 à 3 courses faciles par semaine, dont une un peu plus rythmée."
        actions={[
          { label: "Arrêter le programme", onClick: () => void usePlan.getState().apply((api) => api.stopProgram()) },
        ]}
      />
    </Group>
  );
}
