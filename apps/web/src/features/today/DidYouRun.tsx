import type { Run } from "../../api/schemas.ts";
import { relativeMoment } from "../../lib/date.ts";
import { Button } from "../../ui/controls.tsx";
import { SessionChip } from "../../ui/SessionShape.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { usePlan } from "../plan/store.ts";

/**
 * A session that is over and no run from the watch matched it: she says whether she ran it, so it never
 * vanishes without a trace (algo.md EV17, EV21). A skipped session is never made up.
 */
export function DidYouRun({ run, today }: { run: Run; today: string }) {
  const apply = usePlan((s) => s.apply);
  return (
    <Surface as="section" aria-labelledby="did-you-run" className="flex flex-col gap-4 px-5 py-4">
      <div className="flex flex-col gap-1.5">
        <SessionChip tone={run.intensity} title={run.title} />
        <h2 id="did-you-run" className="t-title m-0">
          Tu l'as faite ?
        </h2>
        <p className="t-sub m-0">
          {run.title} · {relativeMoment(run.date, run.start, today)}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Button variant="filled" size="large" onClick={() => void apply((api) => api.confirmDone(run.id))}>
          Oui, je l'ai faite
        </Button>
        <Button size="large" onClick={() => void apply((api) => api.skip(run.id))}>
          Non, je l'ai sautée
        </Button>
      </div>
    </Surface>
  );
}
