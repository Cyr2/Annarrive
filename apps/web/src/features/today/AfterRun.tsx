import type { Activity, Feel, Run } from "../../api/schemas.ts";
import { addDays, decimal } from "../../lib/date.ts";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { Chip } from "../../ui/controls.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { usePlan } from "../plan/store.ts";
import { NextRun } from "./NextRun.tsx";
import { NoteForReggie } from "./NoteForReggie.tsx";
import { Figure, ToneWash } from "./parts.tsx";

// A no-break space keeps the "?" with its word.
const FEEL_QUESTION = "Comment c'était ?";

const FEELS: { value: Feel; label: string }[] = [
  { value: "easy", label: "Facile" },
  { value: "fine", label: "Correct" },
  { value: "hard", label: "Dur" },
];

/**
 * After the run: the day's small moment of pride (the check pops once in the easy green), what she did against
 * the target, her feeling if the watch did not ask, a word for Reggie, then what comes next.
 */
export function AfterRun({ activity, next, today }: { activity: Activity; next?: Run; today: string }) {
  return (
    <>
      <Surface as="article" className="flex flex-col gap-5 overflow-hidden p-5">
        <ToneWash tone="easy" />
        <div className="relative flex items-center gap-3">
          <span className="done-pop flex size-12 flex-none items-center justify-center rounded-full bg-easy-wash text-easy-deep shadow-inset">
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
          <Icon name="checkCircle" size={20} stroke={2.2} className="mt-px flex-none text-easy-deep" />
          {activity.verdict}
        </p>
      </Surface>

      {activity.askFeel && <FeelPicker activity={activity} />}
      <NoteForReggie title={activity.title} />
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

function FeelPicker({ activity }: { activity: Activity }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 px-1">
        <h2 className="t-title">{FEEL_QUESTION}</h2>
        <span className="t-cap" aria-live="polite">
          {activity.feel
            ? "Noté. Reggie en tient compte pour la suite."
            : "Ta montre ne te l'a pas demandé cette fois."}
        </span>
      </div>
      <ChoiceGroup label={FEEL_QUESTION} className="grid grid-cols-3 gap-2">
        {FEELS.map((feel) => (
          <Chip
            key={feel.value}
            selected={activity.feel === feel.value}
            className="w-full"
            onClick={() => void usePlan.getState().run((api) => api.logFeel(activity.id, feel.value))}
          >
            {feel.label}
          </Chip>
        ))}
      </ChoiceGroup>
    </section>
  );
}
