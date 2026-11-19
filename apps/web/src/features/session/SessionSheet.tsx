import { decimal, duration, relativeMoment } from "../../lib/date.ts";
import { tidy } from "../../lib/text.ts";
import { GroupLabel } from "../../ui/List.tsx";
import { RoundAction } from "../../ui/RoundAction.tsx";
import { SessionChip, SessionShape } from "../../ui/SessionShape.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { StepList } from "../../ui/StepList.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { findRun, todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import { TalkLink } from "../reggie/TalkLink.tsx";
import type { SheetProps } from "../sheets/SheetHost.tsx";
import { useSheet } from "../sheets/store.ts";
import { ReggieAvatar, ToneWash } from "../today/parts.tsx";
import { sessionDetail, whyQuestion } from "../today/today.ts";
import { WatchStatus } from "../today/WatchStatus.tsx";

/** Session detail: when and what, every step with its pace, Reggie's why, and the three ways to adjust it. */
export default function SessionSheet({ spec, ...sheet }: SheetProps<"session">) {
  const plan = usePlan();
  const show = useSheet((s) => s.show);
  const run = findRun(plan, spec.id);
  const today = todayOf(plan);
  if (!run) return null;
  const upcoming = run.date >= today;
  const facts = [duration(run.durationMin), run.distanceKm && `${decimal(run.distanceKm)} km environ`];
  const context = sessionDetail(run, today);
  const about = { screen: "today", sessionId: run.id } as const;
  const close = () => sheet.onOpenChange(false);
  const goal = plan.program && !plan.program.maintenance ? plan.program.goal.race : undefined;
  return (
    <Sheet
      {...sheet}
      title={run.title}
      cancelLabel="Fermer"
      footer={
        upcoming && (
          // Pinned under the body: the ways to adjust it stay in reach however far the steps scroll.
          <div className="grid grid-cols-3 gap-2">
            <RoundAction label="Déplacer" icon="move" onClick={() => show({ kind: "move", id: run.id })} />
            <RoundAction label="Changer" icon="change" onClick={() => show({ kind: "change", id: run.id })} />
            <RoundAction label="Pas dispo" icon="close" onClick={() => show({ kind: "unavailable", id: run.id })} />
          </div>
        )
      }
    >
      <Surface variant="inset" className="flex flex-col gap-3 overflow-hidden px-4 pt-2 pb-4">
        <ToneWash tone={run.intensity} />
        <div className="relative flex flex-wrap items-center justify-between gap-x-2">
          <span className="t-strong py-2.5">{relativeMoment(run.date, run.start, today)}</span>
          <WatchStatus run={run} />
        </div>
        <div className="relative flex flex-wrap items-center gap-2">
          <SessionChip tone={run.intensity} title={run.title} />
          <span className="t-sub">{tidy(facts.filter(Boolean).join(" · "))}</span>
        </div>
        <SessionShape steps={run.steps} tone={run.intensity} className="relative h-11" />
        {run.lightened && (
          <div className="relative flex flex-col items-start rounded-row bg-warn-wash px-3 pt-2">
            <p className="t-cap m-0 text-warn-deep">{run.lightened}</p>
            <TalkLink context={context} about={about} onGo={close} question="Pourquoi ma séance est allégée ?" />
          </div>
        )}
      </Surface>
      <section className="flex flex-col gap-2">
        <GroupLabel>Étapes</GroupLabel>
        <Surface variant="inset" className="px-4">
          <StepList steps={run.steps} />
        </Surface>
      </section>
      <Surface as="section" variant="widget" aria-label="Pourquoi cette séance" className="flex gap-3 p-4 pb-2">
        <ReggieAvatar />
        <div className="flex min-w-0 flex-col items-start gap-0.5">
          <span className="t-cap font-semibold text-reggie">Pourquoi cette séance</span>
          <p className="t-body m-0">{run.why}</p>
          <TalkLink context={context} about={about} onGo={close} question={whyQuestion(run, today, goal)} />
        </div>
      </Surface>
    </Sheet>
  );
}
