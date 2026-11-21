import { useEffect, useState } from "react";
import { api } from "../../api/index.ts";
import type { Run } from "../../api/schemas.ts";
import { dayName, duration } from "../../lib/date.ts";
import { Dot } from "../../ui/bits.tsx";
import { Group } from "../../ui/List.tsx";
import { Skeleton } from "../../ui/Skeleton.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { TONES } from "../../ui/tones.ts";
import { ReggieAvatar } from "../today/parts.tsx";
import { firstRuns } from "./onboarding.ts";
import { useOnboarding } from "./store.ts";

/** Reggie speaks, in his green bubble. */
function ReggieSays({ children }: { children: string }) {
  return (
    <div className="flex items-end gap-2">
      <ReggieAvatar size="md" />
      <Surface variant="widget" className="bubble-reggie t-body flex min-w-0 flex-col gap-0.5 px-4 py-3">
        <span className="t-sub font-semibold text-reggie">Reggie</span>
        {children}
      </Surface>
    </div>
  );
}

/** Reggie introduces himself in two sentences, under the logo. */
export function WelcomeStep() {
  return (
    <div className="pt-6">
      <ReggieSays>
        Je cale tes courses entre tes cours et je les envoie sur ta montre. Tu cours, je m'occupe du reste.
      </ReggieSays>
    </div>
  );
}

function RunRow({ run }: { run: Run }) {
  return (
    <div className="row justify-start gap-3">
      <span className="t-sub w-11 flex-none">
        {dayName(run.date).slice(0, 3)}
        <span className="t-strong block text-ink tabular-nums">{Number(run.date.slice(8))}</span>
      </span>
      <Dot size="md" className={TONES[run.intensity].mid} />
      <span className="flex min-w-0 flex-col">
        <span className="t-body">{run.title}</span>
        <span className="t-sub tabular-nums">
          {run.start}, {duration(run.durationMin)}
        </span>
      </span>
    </div>
  );
}

/** Her first week as the coach just built it, read back from the server. */
export function ReadyStep() {
  const today = useOnboarding((s) => s.today);
  const [runs, setRuns] = useState<Run[]>();
  useEffect(() => {
    let live = true;
    const show = (next: Run[]) => live && setRuns(next);
    api()
      .then((client) => Promise.all([client.week(0), client.week(1)]))
      .then((weeks) => show(firstRuns([...weeks[0].items, ...weeks[1].items], today)))
      // Aujourd'hui reads it again: a failed read here only leaves the list out.
      .catch(() => show([]));
    return () => {
      live = false;
    };
  }, [today]);
  return (
    <>
      {runs === undefined ? (
        <Skeleton label="Lecture de ta semaine" className="h-60" />
      ) : (
        runs.length > 0 && (
          <Group>
            {runs.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </Group>
        )
      )}
      <ReggieSays>Ton plan commence demain. Si un cours bouge, je déplace ta course.</ReggieSays>
    </>
  );
}
