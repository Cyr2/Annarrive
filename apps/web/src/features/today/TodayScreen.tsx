import { Button } from "../../ui/Button.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { RoundAction } from "../../ui/RoundAction.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { usePlan } from "../plan/store.ts";
import { useChat } from "../reggie/store.ts";
import { useSheet } from "../sheets/store.ts";
import { useGo } from "../useGo.ts";
import { AfterRun } from "./AfterRun.tsx";
import { DayAgenda } from "./DayAgenda.tsx";
import { RestCard } from "./RestCard.tsx";
import { RunCard } from "./RunCard.tsx";
import { moodOf, sessionContext } from "./today.ts";
import { WeekStrip } from "./WeekStrip.tsx";

/** Aujourd'hui: run day, rest day or after the run (design/Main, Repos, Apres). */
export function TodayScreen() {
  const { status, today, weeks } = usePlan();
  const show = useSheet((s) => s.show);
  const go = useGo();
  const week = weeks[0];

  if (status === "error") {
    return (
      <Screen mood="rest">
        <h1 className="t-large">Aujourd'hui</h1>
        <p className="t-body m-0">Impossible de charger ton plan pour l'instant.</p>
        <Button onClick={() => void usePlan.getState().load()}>Réessayer</Button>
      </Screen>
    );
  }
  if (!today || !week) return <Screen mood="rest">{null}</Screen>;

  const { session, activity, next, goal, date } = today;
  const askReggie = () => {
    useChat.getState().setContext(session ? sessionContext(session, date) : undefined);
    go("/reggie");
  };

  return (
    <Screen mood={moodOf(session, Boolean(activity))}>
      <a
        href="/programme"
        onClick={(e) => {
          e.preventDefault();
          go("/programme");
        }}
        className="glass press t-label inline-flex min-h-11 items-center gap-2 self-start rounded-full px-4 text-text"
      >
        <Icon name="flag" size={16} />
        {goal.label} · J-{goal.daysLeft}
      </a>

      {activity && <AfterRun activity={activity} next={next} today={date} />}
      {!activity && session && (
        <>
          <RunCard run={session} today={date} />
          <div data-tour="actions" className="grid grid-cols-4 gap-2">
            <RoundAction label="Reggie" icon="reggie" main onClick={askReggie} />
            <RoundAction label="Déplacer" icon="move" onClick={() => show({ kind: "move", id: session.id })} />
            <RoundAction label="Changer" icon="change" onClick={() => show({ kind: "change", id: session.id })} />
            <RoundAction label="Pas dispo" icon="close" onClick={() => show({ kind: "unavailable", id: session.id })} />
          </div>
        </>
      )}
      {!activity && !session && <RestCard next={next} today={date} />}

      {!activity && <WeekStrip week={week} today={date} legend={Boolean(session)} />}
      {!activity && <DayAgenda items={week.items} date={date} />}
    </Screen>
  );
}
