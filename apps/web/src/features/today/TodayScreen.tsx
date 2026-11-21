import { Fragment, useDeferredValue, useEffect, useState } from "react";
import type { Run, Today, Week } from "../../api/schemas.ts";
import { LoadFailed } from "../../ui/EmptyState.tsx";
import { Presence } from "../../ui/Presence.tsx";
import { PullToRefresh } from "../../ui/PullToRefresh.tsx";
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
import { RefreshRow, refreshTimetable } from "../week/RefreshRow.tsx";
import { AfterRun } from "./AfterRun.tsx";
import { DayAgenda } from "./DayAgenda.tsx";
import { DidYouRun, FeelAfterConfirm } from "./DidYouRun.tsx";
import { ProposalCard } from "./ProposalCard.tsx";
import { RaceDone } from "./RaceDone.tsx";
import { ReggieNote } from "./ReggieNote.tsx";
import { RestCard } from "./RestCard.tsx";
import { RunCard } from "./RunCard.tsx";
import { ThisWeek } from "./ThisWeek.tsx";
import { beforeFirstRun, sessionContext } from "./today.ts";
import { Unwell } from "./Unwell.tsx";
import { notInReview, useReview, WeekReview } from "./WeekReview.tsx";

let firstDayDrawn = false;

/**
 * The first time the day shows after launch, the week and « Ma journée » under its card wait for the frame after:
 * the card lays out and paints alone, in a shorter task. Every later visit draws them at once.
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

/** Under the card: the week and « Ma journée » (not after the run), then when the timetable was last read. */
function BelowCard({ week, date, day }: { week: Week; date: string; day: boolean }) {
  return (
    <>
      {day && <ThisWeek week={week} today={date} />}
      {day && <DayAgenda items={week.items} date={date} />}
      <RefreshRow checkedAt={week.timetableCheckedAt} change={week.timetableChange} />
    </>
  );
}

/**
 * A first launch: the onboarding comes before the plan, never after a glimpse of an empty rest day. A goal or a
 * run this week is someone already set up: it paints at once, without waiting for the server's answer.
 */
function waitsForOnboarding(need: boolean | undefined, today: Today | undefined, week: Week | undefined) {
  const setUp = Boolean(today?.goal) || Boolean(week?.items.some((item) => item.kind === "run"));
  return need === true || (need === undefined && !setUp);
}

/** The plan could not be read, or is on its way: the card's place is held, so nothing jumps when it arrives. */
function Waiting({ failed }: { failed: boolean }) {
  return (
    <Screen>
      {failed ? (
        <>
          <h1 className="sr-only-label">Aujourd'hui</h1>
          <LoadFailed title="Pas de réseau ?" what="ton plan" onRetry={() => void usePlan.getState().load()} />
        </>
      ) : (
        <Skeleton label="Chargement de ta journée" />
      )}
    </Screen>
  );
}

/** Aujourd'hui: run day, rest day or after the run. */
export function TodayScreen() {
  // Deferred: the screen built from the plan renders in short slices rather than in one long task.
  const { status, today, weeks } = useDeferredValue(usePlan());
  const show = useSheet((s) => s.show);
  const go = useGo();
  const week = weeks[0];
  // After « Oui, je l'ai faite » the question is gone: how it felt is asked where it was.
  const [confirmed, setConfirmed] = useState<Run>();
  const [review, closeReview] = useReview(today?.review);
  const onboarding = waitsForOnboarding(
    useOnboardingNeed((s) => s.need),
    today,
    week,
  );
  const belowCard = useBelowCard(Boolean(today && week && !onboarding));

  if (status === "error" || !today || !week || onboarding) return <Waiting failed={status === "error"} />;

  // After the goal race, its result takes the day's place until she picks what comes next (algo.md RR).
  if (today.race) {
    return (
      <Screen>
        <RaceDone race={today.race} />
      </Screen>
    );
  }

  const { activity, next, date, toConfirm, unwellText } = today;
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
      <PullToRefresh onRefresh={refreshTimetable} />
      {/* The session card holds the page's title; the question that takes its place has none. */}
      {!activity && !session && toConfirm && <h1 className="sr-only-label">Aujourd'hui</h1>}
      {/* Settled once what sits under the card is drawn: the first screen's later frames arrive without motion. */}
      <Presence settled={belowCard}>
        {review && <WeekReview key="review" review={review} onClose={closeReview} />}
        {unwellText && <Unwell text={unwellText} />}
        {/* What Reggie changed because of what she ran (algo.md M10): one line, until the session it moved. */}
        {today.adapted && <ReggieNote key="adapted" text={today.adapted} onClick={askReggie} />}
        {!activity && toConfirm && <DidYouRun key="ask" run={toConfirm} today={date} onDone={setConfirmed} />}
        {!activity && !toConfirm && confirmed && (
          <FeelAfterConfirm key="feel" run={confirmed} onClose={() => setConfirmed(undefined)} />
        )}
        {activity && <AfterRun activity={activity} next={notInReview(review, next)} today={date} />}
        {!activity && session && (
          <Fragment key="session">
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
          </Fragment>
        )}
        {!activity && !session && !toConfirm && (
          <RestCard next={notInReview(review, next)} today={date} first={beforeFirstRun(week, date)} />
        )}
        {today.proposals?.map((p) => (
          <ProposalCard key={p.id} proposal={p} />
        ))}

        {belowCard && <BelowCard key="below" week={week} date={date} day={!activity} />}
      </Presence>
    </Screen>
  );
}
