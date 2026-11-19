import type { Activity, Feel, Run } from "../../api/schemas.ts";
import { addDays, decimal, pastMoment } from "../../lib/date.ts";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { Chip } from "../../ui/controls.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { SectionTitle } from "../../ui/List.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { usePlan } from "../plan/store.ts";
import { NextRun } from "./NextRun.tsx";
import { NoteForReggie } from "./NoteForReggie.tsx";
import { Figure, ToneWash } from "./parts.tsx";

// A no-break space keeps the "?" with its word.
const FEEL_QUESTION = "Comment c'était ?";

export const FEELS: { value: Feel; label: string }[] = [
  { value: "easy", label: "Facile" },
  { value: "fine", label: "Correct" },
  { value: "hard", label: "Dur" },
];

/**
 * After the run: the day's small moment of pride (the check pops once in Reggie's green), what she did against
 * the target, her feeling if the watch did not ask, a word for Reggie, then what comes next.
 */
export function AfterRun({ activity, next, today }: { activity: Activity; next?: Run; today: string }) {
  return (
    <>
      <Surface as="article" className="flex flex-col gap-5 overflow-hidden p-5">
        <ToneWash tone={activity.intensity ?? "easy"} />
        <div className="relative flex items-center gap-3">
          <span className="done-pop flex size-12 flex-none items-center justify-center rounded-full bg-reggie text-on-color shadow-glow-reggie">
            <Icon name="check" size={24} stroke={3} />
          </span>
          <div className="flex min-w-0 flex-col">
            <h1 className="t-large text-balance">{activity.title}</h1>
            <span className="t-cap">Reçue de ta montre à {activity.receivedAt}</span>
          </div>
        </div>
        <dl className="relative m-0 grid grid-cols-[auto_auto_auto] justify-between gap-2">
          <Figure label="Distance" value={decimal(activity.distanceKm)} unit="km" />
          <Figure label="Durée" value={activity.duration} />
          <Figure label={activity.mainPaceLabel} value={activity.mainPace} end />
        </dl>
        <p className="t-body hairline-top relative m-0 flex items-start gap-2 pt-4">
          {activity.cut ? (
            <Icon name="clock" size={20} stroke={2.2} className="mt-px flex-none text-ink-2" />
          ) : (
            <Icon name="checkCircle" size={20} stroke={2.2} className="mt-px flex-none text-reggie" />
          )}
          {activity.verdict}
        </p>
      </Surface>

      {activity.askFeel && (
        <FeelPicker id={activity.id} feel={activity.feel} onPick={(feel) => logFeel(activity.id, feel)} />
      )}
      <NoteForReggie
        context={`${activity.title}, ${pastMoment(today, activity.receivedAt, today).replace(/^\S/, (c) => c.toLowerCase())}`}
      />
      {next?.date === addDays(today, 1) ? (
        <NextRun run={next} today={today} label="Demain" />
      ) : (
        <p className="t-sub m-0 flex items-center gap-2 px-1">
          <Icon name="moon" size={18} className="flex-none" />
          Demain, repos.
        </p>
      )}
    </>
  );
}

/** Sends her answer: the id is the run's, or the session's when no run from the watch matched it. */
export const logFeel = (id: string, feel: Feel) => usePlan.getState().run((api) => api.logFeel(id, feel));

/** « Comment c'était ? » with its three answers: after a run, and after « Oui, je l'ai faite ». */
export function FeelPicker({ id, feel, onPick }: { id: string; feel?: Feel; onPick: (feel: Feel) => void }) {
  return (
    <section className="flex flex-col gap-2" data-feel-for={id}>
      <div className="flex flex-col gap-0.5 px-1">
        <SectionTitle id={`feel-${id}`} className="px-0">
          {FEEL_QUESTION}
        </SectionTitle>
        <span className="t-cap" aria-live="polite">
          {feel ? "Noté. Reggie en tient compte pour la suite." : "Ça m'aide à régler tes prochaines séances."}
        </span>
      </div>
      <ChoiceGroup labelledBy={`feel-${id}`} className="grid grid-cols-3 gap-2">
        {FEELS.map((choice) => (
          <Chip
            key={choice.value}
            selected={feel === choice.value}
            className="w-full"
            onClick={() => onPick(choice.value)}
          >
            {choice.label}
          </Chip>
        ))}
      </ChoiceGroup>
    </section>
  );
}
