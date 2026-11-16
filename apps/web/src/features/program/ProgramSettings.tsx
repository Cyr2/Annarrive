import type { Program, Settings } from "../../api/schemas.ts";
import { Button } from "../../ui/Button.tsx";
import { Dot } from "../../ui/bits.tsx";
import { Group, RowButton, Section } from "../../ui/List.tsx";
import { Switch } from "../../ui/Switch.tsx";
import { strengthShort } from "../add/add.ts";
import { usePlan } from "../plan/store.ts";
import { NotificationsRow } from "../push/NotificationsRow.tsx";
import { type SettingKey, useSheet } from "../sheets/store.ts";
import { SETTING_LABELS, settingValue } from "./program.ts";
import { TimetableRow } from "./TimetableRow.tsx";

const TRAINING: SettingKey[] = ["runsPerWeek", "noRunDays", "notBefore", "notAfter", "bedtime"];

/** The settings groups of the Programme tab: training limits, strength, connections, health, stop. */
export function ProgramSettings({ program }: { program: Program }) {
  const show = useSheet((s) => s.show);
  const { apply } = usePlan.getState();
  const toggle = (patch: Partial<Settings>) => void apply((api) => api.updateSettings(patch), { quiet: true });
  return (
    <>
      <Section title="Entraînement" footnote="Reggie place tes courses dans ces limites, autour de tes cours.">
        <Group>
          {TRAINING.map((key) => (
            <RowButton
              key={key}
              label={SETTING_LABELS[key]}
              value={settingValue(key, program.settings)}
              onClick={() => show({ kind: "setting", key })}
            />
          ))}
        </Group>
      </Section>

      <Section title="Séances de muscu">
        <Group>
          {program.strength.map((t) => (
            <RowButton
              key={t.id}
              label={t.name}
              value={strengthShort(t)}
              onClick={() => show({ kind: "strength", templateId: t.id })}
            />
          ))}
          <RowButton tone="link" label="+ Nouvelle séance" onClick={() => show({ kind: "strength" })} />
        </Group>
      </Section>

      <Section
        title="Connexions"
        footnote="Colle le lien ICS de ton emploi du temps. Il se relit tout seul plusieurs fois par jour : actualise si un cours vient d'être annulé."
      >
        <Group>
          <TimetableRow program={program} />
          <RowButton
            tall
            label={
              <span className="flex flex-col">
                <span className="t-body">Montre Garmin</span>
                <span className="t-cap flex items-center gap-1.5">
                  <Dot size="md" className={program.watch.connected ? "bg-success" : "bg-danger"} />
                  {program.watch.model} · {program.watch.connected ? "connectée" : "déconnectée"}
                </span>
              </span>
            }
            onClick={() => show({ kind: "watch" })}
          />
        </Group>
      </Section>

      <Section
        title="Santé et confidentialité"
        footnote="Tes données restent sur le serveur de l'app. Rien n'est partagé."
      >
        <Group>
          <div className="row">
            <span id="h-sleep" className="t-body">
              Sommeil et fréquence cardiaque
            </span>
            <Switch
              checked={program.settings.recoveryData}
              labelledBy="h-sleep"
              onChange={(recoveryData) => toggle({ recoveryData })}
            />
          </div>
          <div className="row">
            <span id="h-cycle" className="t-body">
              Cycle menstruel
            </span>
            <Switch
              checked={program.settings.cycle}
              labelledBy="h-cycle"
              onChange={(on) => (on ? show({ kind: "cycle" }) : toggle({ cycle: false }))}
            />
          </div>
          <NotificationsRow />
        </Group>
      </Section>

      {!program.maintenance && (
        <Group>
          <Button variant="danger" onClick={() => show({ kind: "stop" })}>
            Arrêter ce programme
          </Button>
        </Group>
      )}
    </>
  );
}
