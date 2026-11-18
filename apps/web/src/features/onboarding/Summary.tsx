import { daysBetween, longDate, weekdayName } from "../../lib/date.ts";
import { Icon, type IconName } from "../../ui/Icon.tsx";
import { Group, RowButton, Section } from "../../ui/List.tsx";
import { PaceValue } from "../../ui/PaceValue.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { clock } from "../program/program.ts";
import { TargetTag, VERDICT_KIND } from "../program/TargetTag.tsx";
import { DISTANCES, type Draft, distanceOf, type Step, targetOf } from "./onboarding.ts";
import { useDraft } from "./parts.tsx";
import { useOnboarding } from "./store.ts";

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const list = (items: string[], empty: string) => (items.length ? items.join(", ") : empty);

/** Each line of the summary, and the step that changes it. */
function rows(draft: Draft): [string, string, Step][] {
  const days = [...draft.noRunDays].sort((a, b) => a - b).map((d) => weekdayName(d - 1).toLowerCase());
  const last = DISTANCES.find((d) => d.value === draft.lastRace);
  return [
    ["Dernier chrono", draft.lastSec > 0 && last ? `${last.label} en ${clock(draft.lastSec)}` : "Aucun", "last"],
    ["Courses", `${draft.runsPerWeek} par semaine${days.length ? `, sauf ${days.join(", ")}` : ""}`, "week"],
    ["Horaires", `${draft.earliest} à ${draft.latestEnd}, coucher ${draft.bedtime}`, "hours"],
    [
      "Muscu",
      list(
        draft.strength.map((s) => s.name.trim()),
        "Plus tard",
      ),
      "strength",
    ],
    ["Douleur", draft.pain && draft.zone ? `${draft.zone}, ${draft.level} sur 10` : "Aucune", "health"],
    ["Données lues", draft.useSleepHr ? "Sommeil et fréquence cardiaque" : "Aucune", "health"],
    ["Cycle menstruel", draft.cycleTracking ? "Activé" : "Désactivé", "health"],
  ];
}

/** The goal she set, as the plan's headline: race, countdown, target. */
function Goal({ draft }: { draft: Draft }) {
  const today = useOnboarding((s) => s.today);
  const verdict = useOnboarding((s) => s.verdict);
  const goTo = useOnboarding((s) => s.goTo);
  const distance = DISTANCES.find((d) => d.value === distanceOf(draft));
  const target = targetOf(draft);
  if (!distance)
    return (
      <Surface className="flex flex-col gap-1 p-5">
        <span className="t-cap">Pas d'objectif</span>
        <h2 className="t-large m-0">Entretenir ta forme</h2>
        <span className="t-sub">2 à 3 courses faciles par semaine, dont une un peu plus rythmée.</span>
      </Surface>
    );
  const weeks = Math.round(daysBetween(today, draft.date) / 7);
  return (
    <Surface as="section" aria-label="Ton objectif" className="flex flex-col gap-4 p-5">
      <button
        type="button"
        onClick={() => goTo("race")}
        className="press flex flex-col gap-1 border-0 bg-transparent p-0 text-left text-ink"
      >
        <span className="t-cap">Ton objectif</span>
        <span className="t-large">{distance.value === 21097.5 ? "Semi-marathon" : distance.label}</span>
        <span className="t-sub">
          {capitalize(longDate(draft.date))}, dans {weeks} {weeks > 1 ? "semaines" : "semaine"}
        </span>
      </button>
      <button
        type="button"
        onClick={() => goTo("target")}
        className="press hairline-top flex flex-col gap-1 border-0 bg-transparent px-0 pt-4 pb-0 text-left"
      >
        <span className="t-cap">{target ? "Chrono visé" : "Objectif"}</span>
        <span className="flex flex-wrap items-center justify-between gap-2">
          <PaceValue value={target ? clock(draft.targetSec) : "Finir"} size="figure" />
          {target && verdict && <TargetTag kind={VERDICT_KIND[verdict]} />}
        </span>
      </button>
    </Surface>
  );
}

export function SummaryStep() {
  const draft = useDraft();
  const error = useOnboarding((s) => s.error);
  const goTo = useOnboarding((s) => s.goTo);
  return (
    <>
      <Goal draft={draft} />
      <section aria-label="Récapitulatif">
        <Group>
          {rows(draft).map(([label, value, step]) => (
            <RowButton key={label} label={label} value={value} onClick={() => goTo(step)} />
          ))}
        </Group>
      </section>
      {error && (
        <p role="alert" className="t-sub m-0 px-1 text-warn-deep">
          {error}
        </p>
      )}
    </>
  );
}

const PROMISES: [IconName, string][] = [
  ["class", "Tes courses se placent autour de tes cours."],
  ["watch", "Chaque séance arrive sur ta montre."],
  ["reggie", "Reggie ajuste ta semaine quand elle change."],
];

/** What she is about to get: three promises, under the logo's place. */
export function WelcomeStep() {
  return (
    <Section>
      <ul className="m-0 flex list-none flex-col gap-3 p-0 px-1">
        {PROMISES.map(([icon, text]) => (
          <li key={icon} className="t-body flex items-center gap-3">
            <Icon name={icon} size={22} className="flex-none text-ink-2" />
            {text}
          </li>
        ))}
      </ul>
    </Section>
  );
}
