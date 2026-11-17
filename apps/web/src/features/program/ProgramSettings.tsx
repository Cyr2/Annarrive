import type { Program, Settings } from "../../api/schemas.ts";
import { Group, RowButton, Section } from "../../ui/List.tsx";
import { TextButton } from "../../ui/TextButton.tsx";
import { strengthShort } from "../add/add.ts";
import { usePlan } from "../plan/store.ts";
import { NotificationsRow } from "../push/NotificationsRow.tsx";
import { usePush } from "../push/store.ts";
import { useSheet } from "../sheets/store.ts";
import { Hours, Runs, Watch } from "./SettingGroups.tsx";
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

      <Section
        title="Santé et confidentialité"
        footnote="Tes données restent sur le serveur de l'app. Rien n'est partagé."
      >
        <Group>
          <SwitchRow
            title="Sommeil et fréquence cardiaque"
            detail="Lus sur ta Garmin, pour alléger une séance après une mauvaise nuit."
            checked={settings.recoveryData}
            onChange={(recoveryData) => toggle({ recoveryData })}
          />
          <SwitchRow
            title="Cycle menstruel"
            detail="Désactivé par défaut. Activé, tu peux signaler un symptôme à Reggie. Tes séances ne suivent jamais la phase du cycle."
            checked={settings.cycle}
            onChange={(on) => (on ? show({ kind: "cycle" }) : toggle({ cycle: false }))}
          />
        </Group>
      </Section>

      {push !== "loading" && push !== "hidden" && (
        <Section
          title="Notifications"
          footnote="Ta semaine prête le dimanche soir, et une course déplacée quand un cours change."
        >
          <Group>
            <NotificationsRow />
          </Group>
        </Section>
      )}

      {!program.maintenance && (
        <Group className="mt-2">
          <TextButton tone="danger" className="min-h-13 w-full" onClick={() => show({ kind: "stop" })}>
            Arrêter ce programme
          </TextButton>
        </Group>
      )}
    </>
  );
}
