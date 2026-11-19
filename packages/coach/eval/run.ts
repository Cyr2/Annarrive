/**
 * Bench of the training algorithm: `pnpm --filter @annarrive/coach eval`.
 * Prints the scores and every failure, then compares with eval/baseline.json and exits 1 on a regression.
 * `--update` rewrites the baseline; `--weeks` also prints each persona's weeks (for the coach review).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { predictTime } from "../src/index.ts";
import { CRITERIA, type Criterion, score } from "./checks.ts";
import { PERSONAS } from "./personas.ts";
import { type RunLog, simulate } from "./sim.ts";

const BASELINE = new URL("./baseline.json", import.meta.url);
type Baseline = Record<string, Record<string, number | null>>;

const runs = PERSONAS.map(simulate);
const results = runs.map((r) => ({ run: r, criteria: CRITERIA.map((c) => c(r)) }));

const mean = (xs: (number | null)[]): number => {
  const v = xs.filter((x) => x !== null);
  return Math.round((10 * v.reduce((a, b) => a + b, 0)) / v.length) / 10;
};
const cell = (x: number | null): string => (x === null ? "n/a" : x.toFixed(1));

function table(): string {
  const ids = PERSONAS.map((p) => p.id);
  const head = `| Critère | ${ids.join(" | ")} | Moyenne |\n|---|${ids.map(() => "---|").join("")}---|`;
  const rows = CRITERIA.map((_, k) => {
    const scores = results.map((r) => score(r.criteria[k] as Criterion));
    const first = results[0]?.criteria[k];
    return `| ${first?.label} | ${scores.map(cell).join(" | ")} | ${cell(mean(scores))} |`;
  });
  const totals = results.map((r) => mean(r.criteria.map(score)));
  return [head, ...rows, `| **Note** | ${totals.map(cell).join(" | ")} | **${cell(mean(totals))}** |`].join("\n");
}

function failures(): string {
  return results
    .flatMap(({ run, criteria }) =>
      criteria.flatMap((c) =>
        c.failures.map(
          (f) => `- ${run.persona.id} · S${f.week} · ${c.label} · ${f.rule} · ${f.severity} : ${f.detail}`,
        ),
      ),
    )
    .join("\n");
}

const r0 = (x: number): number => Math.round(x);
/** 108.9 min → "1:48:54". */
const clock = (min: number): string => {
  const s = Math.round(min * 60);
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** One line per week: what was built, run, decided and proposed (the raw material of the coach review). */
function weeks(r: RunLog): string {
  return r.weeks
    .map((w) => {
      const built = w.built
        .map((s) => `${s.start.slice(5, 16)} ${s.type} ${r0(s.durMin)}`)
        .sort()
        .join(", ");
      const decided = w.decisions
        .filter((d) => d.changed)
        .map((d) => `${d.date.slice(5)} ${d.action} (${d.signals.join("+")})`);
      const props = w.proposals.map((p) => `${p.ruleId} ${p.from}→${p.to}`);
      const ran = r0(w.activities.reduce((a, x) => a + x.durMin, 0));
      const d = r.persona.goal.distanceM;
      const race = `prédit ${clock(predictTime(w.vdotEnd, d))} (réel ${clock(predictTime(w.trueVdot, d))})`;
      const adapted = w.adaptations.length ? ` · adapté : ${w.adaptations.join(", ")}` : "";
      return `S${w.week} ${w.phase} · plan ${r0(w.planMin)} · construit ${r0(w.built.reduce((a, s) => a + s.durMin, 0))} · couru ${ran} · VDOT ${w.vdotEnd.toFixed(1)} (réel ${w.trueVdot.toFixed(1)}) · ${race} · ${built}${decided.length ? ` · matin : ${decided.join(", ")}` : ""}${props.length ? ` · propositions : ${props.join(", ")}` : ""}${adapted}`;
    })
    .join("\n");
}

const current: Baseline = Object.fromEntries(
  results.map(({ run, criteria }) => [run.persona.id, Object.fromEntries(criteria.map((c) => [c.id, score(c)]))]),
);

console.info(table());
console.info(`\n${failures()}`);
if (process.argv.includes("--weeks")) for (const r of runs) console.info(`\n## ${r.persona.label}\n${weeks(r)}`);

if (process.argv.includes("--update")) {
  writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
  console.info("\nBase de référence mise à jour.");
} else {
  const base = JSON.parse(readFileSync(BASELINE, "utf8")) as Baseline;
  const worse = Object.entries(current).flatMap(([id, scores]) =>
    Object.entries(scores).flatMap(([crit, s]) => {
      const before = base[id]?.[crit];
      return before !== undefined && before !== null && s !== null && s < before
        ? [`${id} · ${crit} : ${before} → ${s}`]
        : [];
    }),
  );
  if (worse.length > 0) {
    console.error(`\nRégression par rapport à eval/baseline.json :\n${worse.join("\n")}`);
    process.exit(1);
  }
  console.info("\nAucune régression par rapport à eval/baseline.json.");
}
