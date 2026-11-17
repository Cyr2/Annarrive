import { LoadFailed } from "../../ui/EmptyState.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { RoundAction } from "../../ui/RoundAction.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { Skeleton } from "../../ui/Skeleton.tsx";
import { useOnboardingNeed } from "../onboarding/done.ts";
import { usePlan } from "../plan/store.ts";
import { useChat } from "../reggie/store.ts";
import { preloadSheet } from "../sheets/SheetHost.tsx";
import { useSheet } from "../sheets/store.ts";
import { useGo } from "../useGo.ts";
import { changeOptions, moveOptions } from "../useLoad.ts";
import { RefreshRow } from "../week/RefreshRow.tsx";
import { AfterRun } from "./AfterRun.tsx";
import { DayAgenda } from "./DayAgenda.tsx";
import { DidYouRun } from "./DidYouRun.tsx";
import { ProposalCard } from "./ProposalCard.tsx";
import { ReggieNote } from "./ReggieNote.tsx";
import { RestCard } from "./RestCard.tsx";
import { RunCard } from "./RunCard.tsx";
import { sessionContext } from "./today.ts";
import { Unwell } from "./Unwell.tsx";
import { WeekStrip } from "./WeekStrip.tsx";

/** Aujourd'hui: run day, rest day or after the run. */
export function TodayScreen() {
  const { status, today, weeks } = usePlan();
  const show = useSheet((s) => s.show);
  const go = useGo();
  const week = weeks[0];
  // A first launch: the onboarding comes before the plan, never after a glimpse of an empty rest day.
  const onboarding = useOnboardingNeed((s) => s.need !== false);

  if (status === "error") {
    return (
      <Screen>
        <h1 className="sr-only-label">Aujourd'hui</h1>
        <LoadFailed title="Plan indisponible" what="ton plan" onRetry={() => void usePlan.getState().load()} />
      </Screen>
    );
  }
  if (!today || !week || onboarding) {
    // The card's place, held while the plan loads, so nothing jumps when it arrives.
    return (
      <Screen>
        <Skeleton label="Chargement de ta journée" />
      </Screen>
    );
  }

  const { activity, next, goal, date, toConfirm, unwellText } = today;
  // Over and unconfirmed: the question replaces the card, it no longer offers to move or change it.
  const session = today.session?.id === toConfirm?.id ? undefined : today.session;
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

      {unwellText && <Unwell text={unwellText} />}
      {!activity && toConfirm && <DidYouRun run={toConfirm} today={date} />}
      {activity && <AfterRun activity={activity} next={next} today={date} />}
      {!activity && session && (
        <>
          <RunCard run={session} today={date} />
          <div data-tour="actions" className="flex flex-col gap-4">
            <ReggieNote text={session.why} onClick={askReggie} />
            {/* The four round actions were chosen by the owner: Reggie first, filled in his green. */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(3.5rem,1fr))] gap-2">
              <RoundAction label="Reggie" icon="reggie" reggie onClick={askReggie} />
              <RoundAction
                label="Déplacer"
                icon="move"
                onPrepare={() => {
                  preloadSheet("move");
                  moveOptions.start(session.id);
                }}
                onClick={() => show({ kind: "move", id: session.id })}
              />
              <RoundAction
                label="Changer"
                icon="change"
                onPrepare={() => {
                  preloadSheet("change");
                  changeOptions.start(session.id);
                }}
                onClick={() => show({ kind: "change", id: session.id })}
              />
              <RoundAction
                label="Pas dispo"
                icon="close"
                onPrepare={() => preloadSheet("unavailable")}
                onClick={() => show({ kind: "unavailable", id: session.id })}
              />
            </div>
          </div>
        </>
      )}
      {!activity && !session && !toConfirm && <RestCard next={next} today={date} />}
      {today.proposals?.map((p) => (
        <ProposalCard key={p.id} proposal={p} />
      ))}

      {!activity && <WeekStrip week={week} today={date} legend={Boolean(session)} />}
      {!activity && <DayAgenda items={week.items} date={date} />}
      <RefreshRow checkedAt={week.timetableCheckedAt} change={week.timetableChange} />
    </Screen>
  );
}
