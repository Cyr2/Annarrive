import { IMPLAUSIBLE_TIME, plausibleTime } from "@annarrive/protocol";
import { useState } from "react";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { Button, Chip } from "../../ui/controls.tsx";
import { Group, RowSelect, Section, SectionTitle } from "../../ui/List.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { TimeBoxes } from "../../ui/TimeBoxes.tsx";
import { todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import type { SheetProps } from "../sheets/SheetHost.tsx";
import { RACE_AGO, RACE_DISTANCES, raceAgoOf, raceDateOf } from "./program.ts";

/**
 * « Ta dernière course », from « Ton niveau »: one race, the latest, in three questions. Saved with Enregistrer,
 * her paces follow (algo.md F10).
 */
export default function LastTimeSheet(sheet: SheetProps<"lastTime">) {
  const plan = usePlan();
  const today = todayOf(plan);
  const last = plan.program?.lastTime;
  const [distanceM, setDistance] = useState<number>(last?.distanceM ?? 21097.5);
  const [seconds, setSeconds] = useState(Math.round((last?.minutes ?? 0) * 60));
  const [ago, setAgo] = useState(raceAgoOf(last?.date, today));
  const typed = seconds > 0 ? { distanceM, minutes: seconds / 60, date: raceDateOf(ago, today) } : undefined;
  const time = typed && plausibleTime(typed.distanceM, typed.minutes) ? typed : undefined;
  const save = async () => {
    if (!time) return;
    const done = await plan.apply((api) => api.updateLastTime(time));
    if (done) sheet.onOpenChange(false);
  };
  return (
    <Sheet
      {...sheet}
      title="Ta dernière course"
      footer={
        <Button variant="filled" size="large" disabled={!time} onClick={() => void save()}>
          Enregistrer
        </Button>
      }
    >
      <Section>
        <SectionTitle id="last-distance">Quelle distance ?</SectionTitle>
        <ChoiceGroup labelledBy="last-distance" className="flex flex-wrap gap-2">
          {RACE_DISTANCES.map((d) => (
            <Chip key={d.label} selected={distanceM === d.value} onClick={() => setDistance(d.value)}>
              {d.label}
            </Chip>
          ))}
        </ChoiceGroup>
      </Section>
      <Section>
        <SectionTitle>En combien de temps ?</SectionTitle>
        <TimeBoxes seconds={seconds} onChange={setSeconds} />
      </Section>
      <Section>
        <SectionTitle>Il y a combien de temps ?</SectionTitle>
        <Group>
          <RowSelect label="Il y a" value={ago} options={RACE_AGO} onChange={setAgo} />
        </Group>
      </Section>
      {/* In place of the note, not under it: the sheet keeps its height. */}
      <p className="t-cap m-0 px-4" aria-live="polite">
        {typed && !time ? IMPLAUSIBLE_TIME : "Une seule course : la plus récente. Tes allures en découlent."}
      </p>
    </Sheet>
  );
}
