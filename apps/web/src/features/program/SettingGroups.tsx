import type { Program, Settings } from "../../api/schemas.ts";
import { ago } from "../../lib/date.ts";
import { Dot } from "../../ui/bits.tsx";
import { Group, RowButton, Section } from "../../ui/List.tsx";
import { DISTANCES } from "../onboarding/onboarding.ts";
import { type SettingKey, useSheet } from "../sheets/store.ts";
import { DayWindow } from "./DayWindow.tsx";
import { clock, SETTING_LABELS, settingValue, watchState } from "./program.ts";

/** Groups of the Programme tab that read the plan's settings: runs, hours, the watch. */

const HOURS: SettingKey[] = ["notBefore", "notAfter", "bedtime"];

const RUNS: SettingKey[] = ["runsPerWeek", "noRunDays", "longRunDays"];

/** Every setting opens the same sheet, saved with « Enregistrer »: one undoable change, never a change per tap. */
export function Runs({ settings }: { settings: Settings }) {
  const show = useSheet((s) => s.show);
  return (
    <Section title="Tes courses" footnote="Reggie place tes courses dans ces limites, autour de tes cours.">
      <Group>
        {RUNS.map((key) => (
          <RowButton
            key={key}
            label={SETTING_LABELS[key]}
            value={settingValue(key, settings)}
            onClick={() => show({ kind: "setting", key })}
          />
        ))}
      </Group>
    </Section>
  );
}

/** « Ton dernier chrono »: her own word on her level, next to what Garmin says of it. */
export function LastTime({ last }: { last: Program["lastTime"] }) {
  const show = useSheet((s) => s.show);
  const race = last && DISTANCES.find((d) => d.value === last.distanceM);
  return (
    <Section title="Ton niveau" footnote="Un chrono récent, ou ton temps estimé : Reggie en tire tes allures.">
      <Group>
        <RowButton
          label="Ton dernier chrono"
          value={
            last
              ? `${race?.label ?? `${last.distanceM / 1000} km`} en ${clock(Math.round(last.minutes * 60))}`
              : "Aucun"
          }
          onClick={() => show({ kind: "lastTime" })}
        />
      </Group>
    </Section>
  );
}

export function Hours({ settings }: { settings: Settings }) {
  const show = useSheet((s) => s.show);
  return (
    <Section title="Tes horaires" footnote="Tes courses finissent au moins 1 h avant ton coucher.">
      <Group>
        <DayWindow notBefore={settings.notBefore} notAfter={settings.notAfter} bedtime={settings.bedtime} />
        {HOURS.map((key) => (
          <RowButton
            key={key}
            label={SETTING_LABELS[key]}
            value={settingValue(key, settings)}
            onClick={() => show({ kind: "setting", key })}
          />
        ))}
      </Group>
    </Section>
  );
}

export function Watch({ watch }: { watch: Program["watch"] }) {
  const show = useSheet((s) => s.show);
  const state = watchState(watch.connected);
  return (
    <Section title="Montre">
      <Group>
        <RowButton
          label={
            <span className="flex flex-col">
              <span className="t-body">Garmin {watch.model}</span>
              <span className="t-cap flex items-center gap-1.5">
                <Dot size="md" className={watch.connected ? "bg-ok" : "bg-warn"} />
                {watch.lastSync ? `${state}, synchro ${ago(watch.lastSync, new Date())}` : state}
              </span>
            </span>
          }
          onClick={() => show({ kind: "watch" })}
        />
      </Group>
    </Section>
  );
}
