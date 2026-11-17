import { useState } from "react";
import type { Run } from "../../api/schemas.ts";
import { pastMoment } from "../../lib/date.ts";
import { Button } from "../../ui/controls.tsx";
import { SectionTitle } from "../../ui/List.tsx";
import { SessionChip } from "../../ui/SessionShape.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { TextButton } from "../../ui/TextButton.tsx";
import { usePlan } from "../plan/store.ts";
import { FeelPicker, logFeel } from "./AfterRun.tsx";

/**
 * A session that is over and no run from the watch matched it: she says whether she ran it, so it never
 * vanishes without a trace (algo.md EV17, EV21). A skipped session is never made up.
 */
export function DidYouRun({ run, today, onDone }: { run: Run; today: string; onDone: (run: Run) => void }) {
  const apply = usePlan((s) => s.apply);
  const confirm = async () => {
    if (await apply((api) => api.confirmDone(run.id))) onDone(run);
  };
  return (
    <Surface as="section" aria-labelledby="did-you-run" className="flex flex-col gap-4 px-5 py-4">
      <div className="flex flex-col gap-1.5">
        <SessionChip tone={run.intensity} title={run.title} />
        <SectionTitle id="did-you-run" className="px-0">
          Tu l'as faite ?
        </SectionTitle>
        <p className="t-sub m-0">
          {run.title} · {pastMoment(run.date, run.start, today)}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Button variant="filled" size="large" onClick={() => void confirm()}>
          Oui, je l'ai faite
        </Button>
        <Button size="large" onClick={() => void apply((api) => api.skip(run.id))}>
          Non, je l'ai sautée
        </Button>
      </div>
    </Surface>
  );
}

/** « Tu l'as faite ? », then, once she says yes, how it felt. The state stays here: the question card is gone by then. */
export function ConfirmZone({ toConfirm, today }: { toConfirm?: Run; today: string }) {
  const [confirmed, setConfirmed] = useState<Run>();
  if (toConfirm) return <DidYouRun run={toConfirm} today={today} onDone={setConfirmed} />;
  return confirmed ? <FeelAfterConfirm run={confirmed} onClose={() => setConfirmed(undefined)} /> : null;
}

/**
 * After « Oui, je l'ai faite »: no run came from the watch, so the question it would have asked comes here, with the
 * same answers. Skippable: leaving it unanswered costs nothing.
 */
export function FeelAfterConfirm({ run, onClose }: { run: Run; onClose: () => void }) {
  return (
    <Surface as="section" className="flex flex-col gap-3 px-5 py-4">
      <FeelPicker
        id={run.id}
        onPick={async (feel) => {
          if (await logFeel(run.id, feel)) onClose();
        }}
      />
      <TextButton onClick={onClose}>Passer</TextButton>
    </Surface>
  );
}
