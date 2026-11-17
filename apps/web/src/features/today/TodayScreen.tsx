import { useDeferredValue, useEffect, useState } from "react";
import { Button } from "../../ui/controls.tsx";
import { EmptyState } from "../../ui/EmptyState.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { RoundAction } from "../../ui/RoundAction.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { usePlan } from "../plan/store.ts";
import { useChat } from "../reggie/store.ts";
import { useSheet } from "../sheets/store.ts";
import { useGo } from "../useGo.ts";
import { AfterRun } from "./AfterRun.tsx";
import { DayAgenda } from "./DayAgenda.tsx";
import { ProposalCard } from "./ProposalCard.tsx";
import { ReggieNote } from "./ReggieNote.tsx";
import { RestCard } from "./RestCard.tsx";
import { RunCard } from "./RunCard.tsx";
import { sessionContext } from "./today.ts";
import { WeekStrip } from "./WeekStrip.tsx";

let firstDayDrawn = false;

/**
 * The first time the day shows after launch, the week strip and « Ma journée » under its card wait for the frame
 * after: the card lays out and paints alone, in a shorter task. Every later visit draws them at once.
 */
function useBelowCard(ready: boolean) {
  const [shown, setShown] = useState(firstDayDrawn);
  useEffect(() => {
    if (!ready || shown) return;
    const frame = requestAnimationFrame(() =>
      setTimeout(() => {
        firstDayDrawn = true;
        setShown(true);
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [ready, shown]);
  return shown;
}

/** Aujourd'hui: run day, rest day or after the run. */
export function TodayScreen() {
  // Deferred: the screen built from the plan renders in short slices rather than in one long task.
  const { status, today, weeks } = useDeferredValue(usePlan());
  const show = useSheet((s) => s.show);
  const go = useGo();
  const week = weeks[0];
  const belowCard = useBelowCard(Boolean(today && week));

  if (status === "error") {
    return (
      <Screen>
        <h1 className="t-large">Aujourd'hui</h1>
        <EmptyState
          icon="info"
          title="Plan indisponible"
          action={
            <Button variant="filled" icon="change" onClick={() => void usePlan.getState().load()}>
              Réessayer
            </Button>
          }
        >
          Impossible de charger ton plan. Vérifie ta connexion, puis réessaie.
        </EmptyState>
      </Screen>
    );
  }
  if (!today || !week) {
    // The card's place, held while the plan loads, so nothing jumps when it arrives.
    return (
      <Screen>
        <Surface aria-busy="true" aria-label="Chargement de ta journée" className="h-96 motion-safe:animate-pulse" />
      </Screen>
    );
  }

  const { session, activity, next, goal, date } = today;
  const askReggie = () => {
    useChat
      .getState()
      .setContext(session && sessionContext(session, date), { screen: "today", sessionId: session?.id });
    go("/reggie");
  };

  return (
    <Screen>
      {goal && (
        <a
          href="/programme"
          onClick={(e) => {
            e.preventDefault();
            go("/programme");
          }}
          className="ui-glass press t-label inline-flex min-h-11 items-center gap-2 self-start rounded-full px-4 text-ink"
        >
          <Icon name="flag" size={16} />
          {goal.label} · J-{goal.daysLeft}
        </a>
      )}

      {activity && <AfterRun activity={activity} next={next} today={date} />}
      {!activity && session && (
        <>
          <RunCard run={session} today={date} />
          <div data-tour="actions" className="flex flex-col gap-4">
            <ReggieNote text={session.why} onClick={askReggie} />
            {/* The four round actions were chosen by the owner: Reggie first, filled in his green. */}
            <div className="grid grid-cols-4 gap-2">
              <RoundAction label="Reggie" icon="reggie" reggie onClick={askReggie} />
              <RoundAction label="Déplacer" icon="move" onClick={() => show({ kind: "move", id: session.id })} />
              <RoundAction label="Changer" icon="change" onClick={() => show({ kind: "change", id: session.id })} />
              <RoundAction
                label="Pas dispo"
                icon="close"
                onClick={() => show({ kind: "unavailable", id: session.id })}
              />
            </div>
          </div>
        </>
      )}
      {!activity && !session && <RestCard next={next} today={date} />}
      {today.proposals?.map((p) => (
        <ProposalCard key={p.id} proposal={p} />
      ))}

      {belowCard && !activity && <WeekStrip week={week} today={date} legend={Boolean(session)} />}
      {belowCard && !activity && <DayAgenda items={week.items} date={date} />}
    </Screen>
  );
}
