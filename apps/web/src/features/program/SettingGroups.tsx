import type { Program, Settings } from "../../api/schemas.ts";
import { ago, weekdayName } from "../../lib/date.ts";
import { Dot } from "../../ui/bits.tsx";
import { SegmentedControl } from "../../ui/controls.tsx";
import { Group, RowButton, RowSelect, Section } from "../../ui/List.tsx";
import { usePlan } from "../plan/store.ts";
import { type SettingKey, useSheet } from "../sheets/store.ts";
import { useGo } from "../useGo.ts";
import { DayWindow } from "./DayWindow.tsx";
import { SETTING_LABELS, settingValue } from "./program.ts";

/** Groups of the Programme tab that read the plan's settings: runs, hours, the watch. */

const COUNTS = ["3", "4", "5"].map((value) => ({ value, label: value }));
const DAYS = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ value: String(d), label: weekdayName(d) }));
/** Sunday: the coach's default long-run day (algo.md S8). */
const SUNDAY = 6;
const HOURS: SettingKey[] = ["notBefore", "notAfter", "bedtime"];

export function Runs({ settings }: { settings: Settings }) {
  const show = useSheet((s) => s.show);
  const apply = usePlan((s) => s.apply);
  const go = useGo();
  const see = { action: { label: "Voir", onClick: () => go("/semaine") } };
  const setRuns = (runsPerWeek: number) => void apply((api) => api.updateSettings({ runsPerWeek }), see);
  const setLongDay = (longRunDay: number) => void apply((api) => api.updateSettings({ longRunDay }), see);
  return (
    <Section title="Tes courses" footnote="Reggie place tes courses dans ces limites, autour de tes cours.">
      <Group>
        <div className="row flex-col items-stretch gap-3 py-3">
          <span className="t-body">Courses par semaine</span>
          <SegmentedControl
            label="Courses par semaine"
            items={COUNTS}
            value={String(settings.runsPerWeek)}
            onChange={(v) => setRuns(Number(v))}
          />
        </div>
        <RowButton
          label={SETTING_LABELS.noRunDays}
          value={settingValue("noRunDays", settings)}
          onClick={() => show({ kind: "setting", key: "noRunDays" })}
        />
        <RowSelect
          label="Sortie longue le"
          value={String(settings.longRunDay ?? SUNDAY)}
          options={DAYS}
          onChange={(day) => setLongDay(Number(day))}
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
  const state = watch.connected ? "Connectée" : "Déconnectée";
  return (
    <Section title="Montre">
      <Group>
        <RowButton
          label={
            <span className="flex flex-col">
              <span className="t-body">Garmin {watch.model}</span>
              <span className="t-cap flex items-center gap-1.5">
                <Dot size="md" className={watch.connected ? "bg-easy" : "bg-warn"} />
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
