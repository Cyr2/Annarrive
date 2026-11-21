import { useState } from "react";
import type { WeekReview as Review, Run } from "../../api/schemas.ts";
import { addDays, dayName, duration, weekRange } from "../../lib/date.ts";
import { Dot } from "../../ui/bits.tsx";
import { IconButton } from "../../ui/controls.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { SectionTitle } from "../../ui/List.tsx";
import { PaceValue } from "../../ui/PaceValue.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { TONES } from "../../ui/tones.ts";
import { usePlan } from "../plan/store.ts";
import { useGo } from "../useGo.ts";
import { ItemRow } from "../week/WeekItem.tsx";
import { ReggieAvatar } from "./parts.tsx";

/**
 * The review still open, and « × »: hidden at once, kept closed by the server for the next reads and devices.
 * On Monday its next week is the one starting today, already on the screen: the review keeps to the week it closes
 * and stays short above today's card (algo.md BR7).
 */
export function useReview(review: Review | undefined, today = ""): [Review | undefined, () => void] {
  const [closed, setClosed] = useState<string>();
  const close = () => {
    if (!review) return;
    setClosed(review.week);
    void usePlan.getState().run((api) => api.dismissReview(review.week));
  };
  if (!review || review.week === closed) return [undefined, close];
  return [today >= addDays(review.monday, 7) ? { ...review, next: [] } : review, close];
}

/** The next run, or null once the review's rows already show it: an information is said once per screen. */
export function notInReview(review: Review | undefined, next: Run | undefined): Run | null | undefined {
  return next && review?.next.some((run) => run.id === next.id) ? null : next;
}

/**
 * Le bilan du dimanche, on top of the day (algo.md BR7): the week in two figures, what stood out, Reggie's word,
 * then the next week's runs in the rows of Semaine and the way there. « × » closes it for good on every device.
 */
export function WeekReview({ review, onClose }: { review: Review; onClose: () => void }) {
  const go = useGo();
  const next = addDays(review.monday, 7);
  return (
    <section aria-label="Ton bilan de la semaine" className="flex flex-col gap-4">
      <Surface as="article" className="relative flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="t-sub m-0 pt-2.5 font-normal">Ta semaine, {weekRange(review.monday)}</h2>
          <IconButton icon="close" label="Fermer le bilan" onClick={onClose} className="-mt-1 -mr-2 flex-none" />
        </div>
        <dl className="m-0 flex flex-wrap gap-x-7 gap-y-3">
          {/* The label reads after its figure, as on the mockup; VoiceOver reads it first. */}
          <div className="flex flex-col-reverse">
            <dt className="t-sub">{review.planned > 1 ? "courses" : "course"}</dt>
            <dd className="m-0">
              <PaceValue value={String(review.done)} unit={`sur ${review.planned}`} size="figure" />
            </dd>
          </div>
          <div className="flex flex-col-reverse">
            <dt className="t-sub">de course</dt>
            <dd className="m-0">
              <PaceValue value={duration(Math.round(review.minutes))} size="figure" />
            </dd>
          </div>
        </dl>
        {review.highlight && (
          <p data-variant="inset" className="surface t-body m-0 flex items-center gap-3 rounded-row px-3.5 py-3">
            <Dot className={TONES[review.highlight.intensity ?? "easy"].mid} size="md" />
            {review.highlight.text}
          </p>
        )}
        <p className="m-0 flex items-start gap-3">
          <ReggieAvatar size="md" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="t-cap font-semibold text-reggie">Reggie</span>
            <span className="t-body">{review.reggie}</span>
          </span>
        </p>
      </Surface>

      {review.next.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionTitle>La semaine prochaine</SectionTitle>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {review.next.map((run) => (
              <li key={run.id} className="flex items-center gap-2">
                <span className="t-cap flex w-9 flex-none flex-col items-center tabular-nums">
                  {dayName(run.date).slice(0, 3)}
                  <span className="t-strong text-ink">{Number(run.date.slice(8))}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <ItemRow item={run} />
                </span>
              </li>
            ))}
          </ul>
          <a
            href={`/semaine?jour=${next}`}
            onClick={(e) => {
              e.preventDefault();
              go(`/semaine?jour=${next}`);
            }}
            className="t-body inline-flex min-h-11 items-center justify-between gap-2 px-1 text-action-deep"
          >
            Voir la semaine
            <Icon name="chevronRight" size={18} className="flex-none" />
          </a>
        </div>
      )}
    </section>
  );
}
