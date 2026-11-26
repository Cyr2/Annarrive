import { parseArgs } from "node:util";
import { toParisLocal } from "../src/time.ts";
import { type Action, type Failure, script, simulate } from "./sim.ts";
import { START } from "./world.ts";

const USAGE = `Le jumeau d'Anna : 3 semaines de gestes tirés au hasard, rejoués sur le vrai serveur, invariants vérifiés à chaque pas.
  run.ts                      3 graines tirées au hasard
  run.ts --seed 42            une graine précise (rejouer un échec)
  run.ts --seeds 10           10 graines à la suite (la nuit)
  run.ts --jours 21           durée simulée
  run.ts --tout               ne s'arrête pas au premier échec d'une graine
  run.ts --budget 300         secondes au plus pour l'ensemble (réduction des échecs comprise)`;

const { values } = parseArgs({
  options: {
    seed: { type: "string" },
    seeds: { type: "string" },
    jours: { type: "string", default: "21" },
    tout: { type: "boolean", default: false },
    "sans-reduction": { type: "boolean", default: false },
    budget: { type: "string", default: "300" },
    help: { type: "boolean", default: false },
  },
});
if (values.help) {
  console.info(USAGE);
  process.exit(0);
}
const days = Number(values.jours);
const deadline = performance.now() + Number(values.budget) * 1000;
const first = values.seed === undefined ? Math.floor(Math.random() * 1_000_000) : Number(values.seed);
const count = Number(values.seeds ?? (values.seed === undefined ? 3 : 1));
const seeds = Array.from({ length: count }, (_, k) => first + k);

// The server logs every gesture; the twin keeps only what it reports. An error log is kept with the step it came in.
const quiet = { info: console.info, warn: console.warn, error: console.error };
let logged: string[] = [];
console.info = () => undefined;
console.warn = () => undefined;
console.error = (...args: unknown[]) => logged.push(args.map(String).join(" "));
const say = (text: string) => quiet.info(text);

const same = (a: Failure, b: Failure) => a.invariant === b.invariant;

/**
 * ddmin, cut short by the deadline: the shortest series of gestures that still breaks the same invariant. Replays
 * stop at the step the failure came in.
 */
async function shrink(seed: number, actions: Action[], failure: Failure): Promise<Action[]> {
  let kept = actions.filter((a) => a.step <= failure.step);
  let chunks = 2;
  while (kept.length > 1 && performance.now() < deadline) {
    const size = Math.ceil(kept.length / chunks);
    let reduced = false;
    for (let start = 0; start < kept.length && performance.now() < deadline; start += size) {
      const candidate = [...kept.slice(0, start), ...kept.slice(start + size)];
      const replay = await simulate(seed, days, candidate, { lastStep: failure.step });
      if (replay.failures.some((f) => same(f, failure))) {
        kept = candidate;
        chunks = Math.max(chunks - 1, 2);
        reduced = true;
        break;
      }
    }
    if (!reduced) {
      if (size === 1) break;
      chunks = Math.min(chunks * 2, kept.length);
    }
  }
  return kept;
}

const at = (step: number) => toParisLocal(new Date(START.getTime() + step * 15 * 60_000)).replace("T", " ");

let failed = 0;
const started = performance.now();
for (const seed of seeds) {
  if (performance.now() > deadline) {
    say(`Budget écoulé avant la graine ${seed}.`);
    break;
  }
  logged = [];
  const actions = script(seed, days);
  const result = await simulate(seed, days, actions, { keepGoing: values.tout });
  const errors = logged.filter((l) => /en échec|a échoué/.test(l));
  say(
    `graine ${seed} : ${result.actions} gestes, ${(result.ms / 1000).toFixed(1)} s, ${result.failures.length === 0 && errors.length === 0 ? "OK" : "ÉCHEC"}`,
  );
  for (const line of errors.slice(0, 5)) say(`  journal du serveur : ${line}`);
  if (errors.length > 0 && result.failures.length === 0) failed++;
  if (result.failures.length === 0) continue;
  failed++;
  const kinds = new Map<string, Failure>();
  for (const f of result.failures) if (!kinds.has(f.invariant)) kinds.set(f.invariant, f);
  for (const f of kinds.values())
    say(`  ✗ ${f.invariant} (pas ${f.step}, ${f.at}, après « ${f.action} ») : ${f.detail}`);
  const firstFailure = result.failures[0];
  if (!firstFailure || values["sans-reduction"]) continue;
  const minimal = await shrink(seed, actions, firstFailure);
  say(`  Rejouer : pnpm --filter @annarrive/server twin --seed ${seed} --jours ${days}`);
  say(
    `  Séquence minimale (${minimal.length} gestes sur ${actions.filter((a) => a.step <= firstFailure.step).length}) :`,
  );
  for (const a of minimal) say(`    ${at(a.step)}  ${a.kind}  r=${a.r.map((x) => x.toFixed(3)).join(",")}`);
}
say(`${seeds.length} graine(s), ${failed} en échec, ${((performance.now() - started) / 1000).toFixed(0)} s.`);
process.exitCode = failed > 0 ? 1 : 0;
