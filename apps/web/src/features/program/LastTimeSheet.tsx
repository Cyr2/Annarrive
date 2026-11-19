import { IMPLAUSIBLE_TIME, plausibleTime } from "@annarrive/protocol";
import { useState } from "react";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { Button, Chip } from "../../ui/controls.tsx";
import { Group, GroupLabel, RowSelect, Section } from "../../ui/List.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { TimeBoxes } from "../../ui/TimeBoxes.tsx";
import { DISTANCES, LAST_WHEN, type LastWhen, lastTimeOf, whenOf } from "../onboarding/onboarding.ts";
import { todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import type { SheetProps } from "../sheets/SheetHost.tsx";

/** « Ton dernier chrono » in Programme, as in onboarding: saved with Enregistrer, her paces follow (algo.md F10). */
export default function LastTimeSheet(sheet: SheetProps<"lastTime">) {
  const plan = usePlan();
  const today = todayOf(plan);
  const last = plan.program?.lastTime;
  const [distanceM, setDistance] = useState<number>(last?.distanceM ?? 21097.5);
  const [seconds, setSeconds] = useState(Math.round((last?.minutes ?? 0) * 60));
  const [when, setWhen] = useState<LastWhen>(whenOf(last?.date, today));
  const typed = lastTimeOf(distanceM, seconds, when, today);
  const time = typed && plausibleTime(typed.distanceM, typed.minutes) ? typed : undefined;
  const save = async () => {
    if (!time) return;
    const done = await plan.apply((api) => api.updateLastTime(time));
    if (done) sheet.onOpenChange(false);
  };
  return (
    <Sheet
      {...sheet}
      title="Ton dernier chrono"
      footer={
        <Button variant="filled" size="large" disabled={!time} onClick={() => void save()}>
          Enregistrer
        </Button>
      }
    >
      <Section>
        <GroupLabel id="last-distance">Distance</GroupLabel>
        <ChoiceGroup labelledBy="last-distance" className="flex flex-wrap gap-2">
          {DISTANCES.map((d) => (
            <Chip key={d.label} selected={distanceM === d.value} onClick={() => setDistance(d.value)}>
              {d.label}
            </Chip>
          ))}
        </ChoiceGroup>
      </Section>
      <TimeBoxes seconds={seconds} onChange={setSeconds} />
      <Group>
        <RowSelect
          label="Quand"
          value={when}
          options={LAST_WHEN.map((w) => ({ value: w.value, label: w.label }))}
          onChange={setWhen}
        />
      </Group>
      {/* In place of the note, not under it: the sheet keeps its height. */}
      <p className="t-cap m-0 px-4" aria-live="polite">
        {typed && !time
          ? IMPLAUSIBLE_TIME
          : "Tes allures sont recalculées. Ce que tu as déplacé à la main reste en place."}
      </p>
    </Sheet>
  );
}
