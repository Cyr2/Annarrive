import type { Program, Settings } from "../../api/schemas.ts";
import { ago } from "../../lib/date.ts";
import { Dot } from "../../ui/bits.tsx";
import { Group, RowButton, Section } from "../../ui/List.tsx";
import { usePlan } from "../plan/store.ts";
import { type SettingKey, useSheet } from "../sheets/store.ts";
import { isNewSetting, SETTING_LABELS, settingValue, watchState } from "./program.ts";

/** Groups of Réglages that read the plan's settings: runs, hours, the watch. */

const RUNS: SettingKey[] = ["runsPerWeek", "longRunDays", "preferredHour"];

const HOURS: SettingKey[] = ["notBefore", "notAfter", "bedtime", "noRunDays", "travelMin"];

/** Every setting opens the same sheet, saved with « Enregistrer »: one undoable change, never a change per tap. */
function SettingRows({ keys, settings }: { keys: SettingKey[]; settings: Settings }) {
  const show = useSheet((s) => s.show);
  const today = usePlan((s) => s.today?.date);
  return (
    <Group>
      {keys.map((key) => (
        <RowButton
          key={key}
          label={
            isNewSetting(key, today) ? (
              <>
                {SETTING_LABELS[key]}{" "}
                <span className="t-cap ml-1 inline-block rounded-full bg-action-wash px-2 align-[2px] font-semibold text-action">
                  Nouveau
                </span>
              </>
            ) : (
              SETTING_LABELS[key]
            )
          }
          value={settingValue(key, settings)}
          onClick={() => show({ kind: "setting", key })}
        />
      ))}
    </Group>
  );
}

export function Runs({ settings }: { settings: Settings }) {
  return (
    <Section title="Tes courses">
      <SettingRows keys={RUNS} settings={settings} />
    </Section>
  );
}

export function Hours({ settings }: { settings: Settings }) {
  return (
    <Section title="Tes horaires" footnote="Reggie place tes courses dans ces limites, autour de tes cours.">
      <SettingRows keys={HOURS} settings={settings} />
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
