import type { RaceResult } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { ChoiceCard } from "../../ui/ChoiceCard.tsx";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { SectionTitle } from "../../ui/List.tsx";
import { LogoSlot } from "../../ui/LogoSlot.tsx";
import { PaceValue } from "../../ui/PaceValue.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { usePlan } from "../plan/store.ts";
import { raceTitle } from "../program/goal.ts";
import { useSheet } from "../sheets/store.ts";
import { ReggieAvatar, ToneWash } from "./parts.tsx";
import { paceText, raceClock, sinceLast, splitLabel, targetGap } from "./today.ts";

/** Her pace over each part of the race, the faster the taller, in the long run's blue: a pace is never orange. */
function Splits({ splits }: { splits: RaceResult["splits"] }) {
  const paces = splits.map((s) => s.paceSKm);
  const [fast, slow] = [Math.min(...paces), Math.max(...paces)];
  const summary = splits.map((s, i) => `${splitLabel(s.toKm, i, splits.length)} ${paceText(s.paceSKm)}`).join(", ");
  return (
    <div role="img" aria-label={`Allure par tranche : ${summary}`} className="flex gap-2">
      {splits.map((s, i) => (
        <div key={s.toKm} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="flex h-24 w-full flex-col items-center justify-end gap-1">
            <span className="t-cap font-semibold text-ink tabular-nums">{paceText(s.paceSKm).replace(" /km", "")}</span>
            <span
              className="w-full rounded-tile bg-linear-to-b from-long to-long-deep"
              // The slowest part keeps 35 % of the height: every bar reads as a bar.
              style={{ height: `${35 + (slow > fast ? (45 * (slow - s.paceSKm)) / (slow - fast) : 45)}%` }}
            />
          </span>
          <span className="t-cap tabular-nums">{splitLabel(s.toKm, i, splits.length)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Après la course objectif (algo.md RR): the result big, against her target and her last race, her pace part by
 * part, Reggie's word and the bib 14, then the two ways on. It takes the place of the day until she picks one.
 */
export function RaceDone({ race }: { race: RaceResult }) {
  const show = useSheet((s) => s.show);
  const gap = race.gapMin === undefined ? undefined : targetGap(race.gapMin);
  const facts = [
    `${paceText((race.timeMin * 60) / race.distanceKm)} en moyenne`,
    race.previous && sinceLast(race.timeMin, race.previous, race.date),
  ].filter(Boolean);
  return (
    <>
      <Surface as="article" aria-labelledby="race-title" className="relative flex flex-col gap-3 overflow-hidden p-5">
        <ToneWash tone="long" />
        <LogoSlot size={52} className="absolute top-5 right-5 rotate-6 rounded-tile shadow-float" />
        <h1 id="race-title" className="t-sub relative m-0 pr-16 font-normal">
          {raceTitle(race)}
        </h1>
        <PaceValue value={raceClock(race.timeMin)} size="figure" className="relative" />
        <span
          className={cx(
            "t-sub relative w-fit rounded-pill px-3 py-1 font-semibold",
            gap ? (gap.under ? "bg-ok-wash text-ok-deep" : "bg-fill text-ink") : "bg-fill text-ink",
          )}
        >
          {gap ? gap.text : "Course finie"}
        </span>
        <p className="t-sub relative m-0 tabular-nums">{facts.join(" · ")}</p>
        {race.splits.length > 1 && <Splits splits={race.splits} />}
        <p className="relative m-0 mt-1 flex items-start gap-3">
          <ReggieAvatar size="md" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="t-cap font-semibold text-reggie">Reggie</span>
            <span className="t-body">{race.reggie}</span>
          </span>
        </p>
      </Surface>

      <section className="flex flex-col gap-2" aria-labelledby="race-next">
        <SectionTitle id="race-next">Et maintenant ?</SectionTitle>
        <p className="t-sub m-0">D'abord {race.recovery}, quelle que soit la suite.</p>
        <ChoiceGroup labelledBy="race-next" className="flex flex-col gap-2">
          <ChoiceCard on={false} onClick={() => show({ kind: "goal" })}>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="t-strong">Une nouvelle course</span>
              <span className="t-sub">Choisis la distance et la date, Reggie refait un plan.</span>
            </span>
          </ChoiceCard>
          <ChoiceCard on={false} onClick={() => void usePlan.getState().apply((api) => api.keepFit())}>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="t-strong">Garder la forme</span>
              <span className="t-sub">Ensuite trois courses par semaine, sans objectif.</span>
            </span>
          </ChoiceCard>
        </ChoiceGroup>
      </section>
    </>
  );
}
