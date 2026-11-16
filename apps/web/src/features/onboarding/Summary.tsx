import { duration, longDate, weekdayName } from "../../lib/date.ts";
import { Glass } from "../../ui/Glass.tsx";
import { DISTANCES, type Draft, distanceOf, targetOf } from "./onboarding.ts";
import { useDraft } from "./parts.tsx";
import { useOnboarding } from "./store.ts";

const list = (items: string[], empty: string) => (items.length ? items.join(", ") : empty);

function rows(draft: Draft): [string, string][] {
  const distance = DISTANCES.find((d) => d.value === distanceOf(draft));
  const target = targetOf(draft);
  const goal: [string, string][] = distance
    ? [
        ["Course", `${distance.label}, ${longDate(draft.date)}`],
        ["Chrono visé", target && !Number.isNaN(target) ? duration(target) : "Finir"],
      ]
    : [["Objectif", "Entretenir ma forme"]];
  return [
    ...goal,
    ["Courses par semaine", String(draft.runsPerWeek)],
    ["Coucher", draft.bedtime],
    ["Créneaux", `${draft.earliest} à ${draft.latestEnd}`],
    [
      "Jours sans course",
      list(
        [...draft.noRunDays].sort((a, b) => a - b).map((d) => weekdayName(d - 1)),
        "Aucun",
      ),
    ],
    [
      "Muscu",
      list(
        draft.strength.map((s) => s.name.trim()),
        "Plus tard",
      ),
    ],
    ["Douleur", draft.pain && draft.zone ? `${draft.zone}, ${draft.level} sur 10` : "Aucune"],
    ["Sommeil et cœur", draft.useSleepHr ? "Oui" : "Non"],
    ["Cycle menstruel", draft.cycleTracking ? "Oui" : "Non"],
  ];
}

export function SummaryStep() {
  const draft = useDraft();
  const error = useOnboarding((s) => s.error);
  return (
    <>
      <Glass as="section" aria-label="Récapitulatif" className="rounded-card py-1">
        <dl className="m-0">
          {rows(draft).map(([label, value]) => (
            <div key={label} className="row">
              <dt className="t-body flex-none">{label}</dt>
              <dd className="t-body m-0 min-w-0 text-right text-text-secondary [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
        </dl>
      </Glass>
      {error && (
        <p role="alert" className="t-sub m-0 px-1 text-danger">
          {error}
        </p>
      )}
    </>
  );
}

export function WelcomeStep() {
  return (
    <p className="t-body m-0">Quelques questions, une par écran. Deux minutes, et ta première semaine est prête.</p>
  );
}
