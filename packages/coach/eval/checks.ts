/**
 * The judge: each criterion checks the weeks of one run against a published rule (Daniels, Pfitzinger, Hansons,
 * the research of research/ and the practice of Runna and Garmin documented in research/05). A check is a pass or a
 * failure; a failure names the week, the rule of docs/specs/algo.md it involves and a severity.
 */
import {
  type Activity,
  addDays,
  at,
  paces as daniels,
  dateOf,
  daysBetween,
  distributionCheck,
  hoursBetween,
  isHard,
  predictTime,
  readRun,
  type Session,
  taperShares,
  weekday,
} from "../src/index.ts";
import { PLAN_START } from "./personas.ts";
import type { RunLog, WeekLog } from "./sim.ts";

export type Severity = "critique" | "majeure" | "mineure";
export type Failure = { week: number; rule: string; detail: string; severity: Severity };
export type Criterion = { id: string; label: string; source: string; checks: number; failures: Failure[] };

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const runs = (w: WeekLog, list: Session[] = w.built): Session[] => list.filter((s) => s.type !== "RACE");
const minutes = (list: Session[]): number => sum(list.map((s) => s.durMin));
const done = (w: WeekLog): number => sum(w.activities.map((a) => a.durMin));
const r0 = (x: number): string => `${Math.round(x)}`;
const isRaceWeek = (r: RunLog, w: WeekLog): boolean =>
  w.monday <= r.persona.goal.date && r.persona.goal.date < addDays(w.monday, 7);
const afterRace = (r: RunLog, w: WeekLog): boolean => w.monday > r.persona.goal.date;
const isTaper = (w: WeekLog): boolean => w.phase.startsWith("taper");

/** Counts the checks and keeps the failures; the failure is only built when the check fails. */
function judge() {
  let checks = 0;
  const failures: Failure[] = [];
  const check = (ok: boolean, f: () => Failure): void => {
    checks++;
    if (!ok) failures.push(f());
  };
  return { check, done: () => ({ checks, failures }) };
}

const longest30 = (acts: Activity[], now: string): number =>
  Math.max(0, ...acts.filter((a) => a.start < now && daysBetween(a.start, now) <= 30).map((a) => a.durMin));

const allRuns = (r: RunLog): Activity[] => [...r.history, ...r.weeks.flatMap((w) => w.activities)];

/** K1: G1 (Frandsen 2025), G2 (Damsted 2019), P10 (Pfitzinger: back to load after a recovery week). */
function volume(r: RunLog): Criterion {
  const j = judge();
  const acts = allRuns(r);
  r.weeks.forEach((w, i) => {
    const buildAt = at(addDays(w.monday, -1), "18:00");
    const cap = 1.1 * longest30(acts, buildAt);
    for (const s of runs(w))
      j.check(s.durMin <= cap + 0.5, () => ({
        week: w.week,
        rule: "G1",
        detail: `${s.type} de ${r0(s.durMin)} min > 1,10 × plus longue des 30 j (${r0(cap / 1.1)} min)`,
        severity: "majeure",
      }));
    const prev = r.weeks[i - 1];
    if (!prev || isRaceWeek(r, w) || afterRace(r, w)) return;
    const built = minutes(runs(w));
    // Frandsen 2025 finds no link between week-to-week ratios and injury: the rise is read against the chronic load,
    // the 3 weeks she ran before, those before the programme included.
    const ranIn = (monday: string): number =>
      sum(acts.filter((a) => a.start >= monday && a.start < addDays(monday, 7)).map((a) => a.durMin));
    const chronic = Math.max(...[1, 2, 3].map((k) => ranIn(addDays(w.monday, -7 * k))));
    j.check(built <= 1.1 * chronic + 1, () => ({
      week: w.week,
      rule: "G2",
      detail: `${r0(built)} min prévues, au-dessus de 1,10 × la meilleure des 3 semaines courues (${r0(chronic)} min)`,
      severity: "majeure",
    }));
    // She ran what was asked last week: nothing justifies building less than the plan (P10, deloads included).
    const followed = done(prev) >= 0.9 * minutes(runs(prev));
    // A test week is lighter by design (research 02 §5.3: the week before a test is eased), not held down by a cap.
    const testWeek = w.built.some((s) => s.type === "TEST");
    if (followed && w.planMin > 0 && !isTaper(w) && !testWeek)
      j.check(built >= 0.85 * w.planMin, () => ({
        week: w.week,
        rule: "G2/G4 contre P10",
        detail: `${r0(built)} min construites pour ${r0(w.planMin)} au plan (${w.phase}) alors que la semaine d'avant a été courue`,
        severity: "majeure",
      }));
  });
  return {
    id: "volume",
    label: "Volume et progression",
    source: "G1 Frandsen 2025 ; G2 Damsted 2019 ; P10 Pfitzinger",
    ...j.done(),
  };
}

/** K2: P16 (Seiler 2010, Rosenblat 2025: ≥ 75 % easy, ≤ 10 % hard), P11 (at most 2 Q + L). */
function intensity(r: RunLog): Criterion {
  const j = judge();
  for (const w of r.weeks) {
    const list = runs(w);
    if (list.length === 0) continue;
    const phase = w.phase.startsWith("base") ? "base" : "dev";
    const d = distributionCheck(list, phase);
    j.check(d.ok, () => ({
      week: w.week,
      rule: "P16",
      detail: `facile ${Math.round(d.z1 * 100)} %, intense ${Math.round(d.z3 * 100)} % (${w.phase})`,
      severity: "majeure",
    }));
    const q = list.filter((s) => isHard(s) && s.type !== "L").length;
    j.check(q <= 2, () => ({
      week: w.week,
      rule: "P11",
      detail: `${q} séances dures hors sortie longue`,
      severity: "majeure",
    }));
  }
  return {
    id: "intensite",
    label: "Intensité 80/20",
    source: "P16 Seiler 2010, Rosenblat 2025 ; P11 Daniels",
    ...j.done(),
  };
}

const MIN_LONG: Record<number, number> = { 21097.5: 60, 42195: 90 };
const LAST_LONG_DAYS: Record<number, number> = { 21097.5: 14, 42195: 21 };

/** K3: P14 (share by runs per week), Daniels (the long run is the week's longest), S8 (her days), Pfitzinger/Hansons (length). */
function longRun(r: RunLog): Criterion {
  const j = judge();
  const p = r.persona;
  const pct = { 3: 0.4, 4: 0.35, 5: 0.3 }[p.settings.runsPerWeek];
  for (const w of r.weeks) {
    if (isRaceWeek(r, w) || afterRace(r, w)) continue;
    const list = runs(w);
    const l = list.find((s) => s.type === "L");
    // P18: the last long run comes at D-14 (half) or D-21 (marathon), none after it.
    const pastLast = daysBetween(w.monday, p.goal.date) < (LAST_LONG_DAYS[p.goal.distanceM] ?? 0);
    if (pastLast) {
      j.check(l === undefined, () => ({
        week: w.week,
        rule: "P18",
        detail: `sortie longue de ${r0(l?.durMin ?? 0)} min après J-${LAST_LONG_DAYS[p.goal.distanceM]}`,
        severity: "majeure",
      }));
      continue;
    }
    j.check(l !== undefined, () => ({
      week: w.week,
      rule: "P13",
      detail: "aucune sortie longue",
      severity: "majeure",
    }));
    if (!l) continue;
    const longestOther = Math.max(0, ...list.filter((s) => s !== l).map((s) => s.durMin));
    j.check(l.durMin >= longestOther - 5, () => ({
      week: w.week,
      rule: "G2 (trimTo) / P14",
      detail: `sortie longue de ${r0(l.durMin)} min, plus courte qu'une autre séance (${r0(longestOther)} min)`,
      severity: "majeure",
    }));
    // P14: past its share only to keep the long run she already ran in the 30 days before (load weeks).
    const held = Math.max(
      0,
      ...allRuns(r)
        .filter((a) => !a.isRace && a.start < w.monday && daysBetween(a.start, w.monday) <= 31)
        .map((a) => a.durMin),
    );
    j.check(l.durMin <= Math.max(pct * minutes(list), held) + 5, () => ({
      week: w.week,
      rule: "P14",
      detail: `sortie longue ${Math.round((100 * l.durMin) / minutes(list))} % du volume (plafond ${pct * 100} %, ou ${r0(held)} min déjà courues)`,
      severity: "mineure",
    }));
    const min = MIN_LONG[p.goal.distanceM];
    // G1 holds the long run to 1.10 × her longest of 30 days: when she cut the last one short, she set that limit.
    const before = r.weeks.find((x) => x.week === w.week - 1);
    const lastL = before?.final.find((s) => s.type === "L");
    const ranL = before?.activities.find((a) => a.id === `run-${lastL?.id}`);
    const cut = lastL !== undefined && ranL !== undefined && ranL.durMin < 0.9 * lastL.durMin;
    // Same with a short base (P6): the long run climbs from her longest of 30 days at G1's 10 % (Frandsen 2025).
    const g1 = l.durMin >= Math.floor(1.1 * longest30(allRuns(r), at(addDays(w.monday, -1), "18:00"))) - 1;
    if (min && !cut && !g1 && !w.phase.startsWith("base") && !w.phase.includes("décharge") && !isTaper(w))
      j.check(l.durMin >= min, () => ({
        week: w.week,
        rule: "P14 / G2",
        detail: `sortie longue de ${r0(l.durMin)} min en ${w.phase} (au moins ${min} min attendues)`,
        severity: "critique",
      }));
    const days = p.settings.preferredLongDays ?? [5, 6];
    j.check(days.includes(weekday(l.start)), () => ({
      week: w.week,
      rule: "S8",
      detail: `sortie longue un ${l.start.slice(0, 10)}`,
      severity: "mineure",
    }));
  }
  return {
    id: "sortie-longue",
    label: "Sortie longue",
    source: "P14 Daniels, recherche 02 §4.3 ; S8 Runna",
    ...j.done(),
  };
}

const legs = (w: WeekLog) => w.cal.filter((e) => e.kind === "strength" && e.legs === true);

/** K4: H4 and S12 (Seiler 2010, 48 h between hard days), H5 and H6 (Doma 2013: legs → hard ≥ 24 h, run first). */
function spacing(r: RunLog): Criterion {
  const j = judge();
  for (const w of r.weeks) {
    const hard = w.final
      .filter((s) => isHard(s) && s.status !== "skipped")
      .sort((a, b) => a.start.localeCompare(b.start));
    hard.forEach((s, i) => {
      const next = hard[i + 1];
      if (next) {
        const h = hoursBetween(s.start, next.start);
        j.check(daysBetween(s.start, next.start) >= 2, () => ({
          week: w.week,
          rule: h < 24 * 1.5 ? "H4" : "S12",
          detail: `${s.type} ${s.start.slice(5)} puis ${next.type} ${next.start.slice(5)} (${r0(h)} h)`,
          severity: daysBetween(s.start, next.start) < 2 ? "majeure" : "mineure",
        }));
      }
      for (const g of legs(w)) {
        const gap = hoursBetween(g.end, s.start);
        if (gap > 0)
          j.check(gap >= 24, () => ({
            week: w.week,
            rule: "H5",
            detail: `${s.type} ${r0(gap)} h après la muscu jambes`,
            severity: "majeure",
          }));
        else if (dateOf(g.start) === dateOf(s.start))
          j.check(hoursBetween(s.start, g.start) >= 1, () => ({
            week: w.week,
            rule: "H6",
            detail: `${s.type} et muscu jambes le même jour`,
            severity: "majeure",
          }));
      }
    });
  }
  return {
    id: "espacement",
    label: "Dur / facile et muscu jambes",
    source: "H4, S12 Seiler 2010 ; H5, H6 Doma 2013",
    ...j.done(),
  };
}

/** K5: F7 (Daniels paces from the true level), RC3/RC4 (Runna Pace Insights: a pattern, never one session, one tap). */
function paces(r: RunLog): Criterion {
  const j = judge();
  for (const w of r.weeks) {
    // Her level of that week: it rises with her training (sim.ts `progress`).
    const truth = Math.round(10 * w.trueVdot) / 10;
    const err = Math.abs(w.vdotEnd - truth);
    j.check(err <= 1, () => ({
      week: w.week,
      rule: "F7 / M8",
      detail: `VDOT de l'app ${w.vdotEnd.toFixed(1)} pour un niveau réel de ${truth}`,
      severity: err > 3 ? "critique" : "majeure",
    }));
    w.proposals.forEach((pr, i) => {
      const away = Math.abs(pr.to - truth) > Math.abs(pr.from - truth) + 0.25;
      j.check(!away, () => ({
        week: w.week,
        rule: pr.ruleId,
        detail: `proposition ${pr.from} → ${pr.to} le ${pr.on}, qui s'éloigne du niveau réel (${truth})`,
        severity: Math.abs(pr.to - truth) > 2 ? "critique" : "majeure",
      }));
      const before = w.proposals.slice(0, i).concat(r.weeks.filter((x) => x.week < w.week).flatMap((x) => x.proposals));
      const recent = before.filter((b) => daysBetween(b.on, pr.on) < 14 && b.ruleId === pr.ruleId);
      j.check(recent.length === 0, () => ({
        week: w.week,
        rule: `${pr.ruleId} (cliquet)`,
        detail: `${pr.ruleId} reproposé le ${pr.on} moins de 14 j après le précédent (${pr.from} → ${pr.to})`,
        severity: "critique",
      }));
    });
  }
  return {
    id: "allures",
    label: "Allures et recalibrage",
    source: "F7 Daniels ; RC3, RC4 Runna Pace Insights ; RC8",
    ...j.done(),
  };
}

type Judge = ReturnType<typeof judge>;

/** D2: one signal alone changes nothing; an exam alone (SG5) is confirmed by itself the next day. */
function mornings(j: Judge, r: RunLog): void {
  for (const w of r.weeks)
    for (const d of w.decisions) {
      const lone = d.signals.length === 1 && !d.yesterday.some((s) => d.signals.includes(s));
      if (lone)
        j.check(!d.changed, () => ({
          week: w.week,
          rule: "D2",
          detail: `séance changée sur un seul signal le ${d.date}`,
          severity: "majeure",
        }));
      const onlyExam = d.signals.every((s) => s === "SG5") && d.signals.length > 0;
      if (onlyExam)
        j.check(!d.changed, () => ({
          week: w.week,
          rule: "D2 / SG5",
          detail: `${d.type} allégée le ${d.date} sur le seul signal « examen » (confirmé par sa répétition)`,
          severity: "mineure",
        }));
    }
}

/** EV9 and research 03 §9: short runs for 3 days after the fever, then back to the plan within two weeks. */
function sickness(j: Judge, r: RunLog): void {
  const sick = r.persona.script.sick;
  if (!sick) return;
  const better = addDays(addDays("2026-11-23", 7 * (sick.week - 1) + sick.day), sick.days);
  for (const w of r.weeks) {
    for (const a of w.activities) {
      const days = daysBetween(better, dateOf(a.start));
      if (days >= 0 && days < 3)
        j.check(a.durMin <= 40, () => ({
          week: w.week,
          rule: "EV9",
          detail: `${r0(a.durMin)} min courues ${days + 1} j après « Ça va mieux »`,
          severity: "majeure",
        }));
    }
    const weeksAfter = daysBetween(better, w.monday) / 7;
    if (weeksAfter >= 2 && w.planMin > 0)
      j.check(minutes(runs(w)) >= 0.85 * w.planMin, () => ({
        week: w.week,
        rule: "G2 / G4",
        detail: `${r0(minutes(runs(w)))} min construites pour ${r0(w.planMin)} au plan, ${Math.floor(weeksAfter)} sem. après la maladie`,
        severity: "majeure",
      }));
  }
}

/** D3, D4 (lighten while it lasts), RC5 (fatigue is not lost fitness), P9 (no rise right after). */
function overreach(j: Judge, r: RunLog): void {
  const o = r.persona.script.overreach;
  if (o) {
    const tired = r.weeks.filter((w) => w.week >= o.from && w.week <= o.to);
    j.check(
      tired.every((w) => w.decisions.some((d) => d.changed)),
      () => ({
        week: o.from,
        rule: "D3 / D4",
        detail: "une semaine de surmenage sans aucun allègement",
        severity: "majeure",
      }),
    );
    const drop = r.persona.trueVdot - Math.min(...r.weeks.map((w) => w.vdotEnd));
    j.check(drop <= 2, () => ({
      week: o.to,
      rule: "RC5",
      detail: `fatigue lue comme une perte de forme : VDOT abaissé de ${drop.toFixed(1)}`,
      severity: "critique",
    }));
    const after = r.weeks.find((w) => w.week === o.to + 1);
    if (after)
      j.check(minutes(runs(after)) <= after.planMin + 1, () => ({
        week: after.week,
        rule: "P9",
        detail: "semaine après surmenage au-dessus du plan",
        severity: "majeure",
      }));
  }
}

/** K6: D2 to D5, EV9 (research 03 §9), Runna « Not Feeling 100% » (research 05 §1.3). */
function health(r: RunLog): Criterion {
  const j = judge();
  mornings(j, r);
  sickness(j, r);
  overreach(j, r);
  return {
    id: "sante",
    label: "Maladie et fatigue",
    source: "D2 à D5 ; EV9 recherche 03 §9 ; Runna Not Feeling 100%",
    ...j.done(),
  };
}

/** K7: EV7, EV16, EV21 (Runna skip, TrainAsONE « des données, pas des dettes »): never made up, never punished. */
function skipped(r: RunLog): Criterion {
  const j = judge();
  r.weeks.forEach((w, i) => {
    const gone = w.final.filter(
      (s) => s.status === "skipped" || (s.status === "planned" && !w.activities.some((a) => a.id === `run-${s.id}`)),
    );
    j.check(w.final.length <= w.built.length, () => ({
      week: w.week,
      rule: "EV16",
      detail: "séance ajoutée dans la semaine",
      severity: "critique",
    }));
    const next = r.weeks[i + 1];
    if (gone.length === 0 || !next || next.planMin === 0) return;
    const built = minutes(runs(next));
    j.check(built <= 1.1 * next.planMin, () => ({
      week: next.week,
      rule: "EV16",
      detail: "séance sautée rattrapée la semaine suivante",
      severity: "critique",
    }));
    j.check(built >= 0.85 * next.planMin, () => ({
      week: next.week,
      rule: "G2 contre EV21",
      detail: `${gone.length} séance(s) sautée(s) en semaine ${w.week} : ${r0(built)} min construites pour ${r0(next.planMin)} au plan`,
      severity: "majeure",
    }));
  });
  return {
    id: "sautees",
    label: "Séances sautées",
    source: "EV7, EV16, EV21 ; Runna ; TrainAsONE (recherche 05)",
    ...j.done(),
  };
}

/** K8: P18 (Bosquet 2007: volume -40 to -60 %, intensity kept), H12 (last Q at J-4), P18 last long run, P24, P23. */
function taper(r: RunLog): Criterion {
  const j = judge();
  const g = r.persona.goal;
  const shares = taperShares(g.distanceM, r.planWeeks);
  r.weeks.forEach((w) => {
    const toRace = Math.floor(daysBetween(w.monday, g.date) / 7);
    const share = shares[shares.length - 1 - toRace];
    if (share !== undefined && w.monday <= g.date) {
      const v = minutes(runs(w));
      j.check(v <= 1.1 * share * r.vPeak, () => ({
        week: w.week,
        rule: "P18",
        detail: `${r0(v)} min hors course pour ${Math.round(share * 100)} % du pic (${r0(share * r.vPeak)} min)`,
        severity: "majeure",
      }));
    }
    if (!isRaceWeek(r, w)) return;
    const race = w.built.find((s) => s.type === "RACE");
    j.check(race?.start === at(g.date, g.startTime ?? "09:00"), () => ({
      week: w.week,
      rule: "P24",
      detail: "course absente ou mal placée",
      severity: "critique",
    }));
    const late = runs(w).filter((s) => isHard(s) && daysBetween(s.start, g.date) < 4);
    j.check(late.length === 0, () => ({
      week: w.week,
      rule: "H12",
      detail: `${late.map((s) => s.type).join(", ")} à moins de 4 j de la course`,
      severity: "critique",
    }));
    const q = runs(w).filter((s) => isHard(s)).length;
    j.check(q <= 1, () => ({
      week: w.week,
      rule: "P11 / P18",
      detail: `${q} séances dures en plus de la course`,
      severity: "majeure",
    }));
  });
  // P18 and Pfitzinger: the last long run near the race is a short one (at most 3/4 of the longest).
  const longs = r.weeks.flatMap((w) => w.final.map((s) => ({ s, week: w.week }))).filter((x) => x.s.type === "L");
  const peak = Math.max(0, ...longs.map((x) => x.s.durMin));
  const minGap = g.distanceM === 42195 ? 21 : g.distanceM === 21097.5 ? 14 : 7;
  if (r.weeks.some((w) => isRaceWeek(r, w)))
    for (const { s, week } of longs.filter((x) => x.s.start < g.date && daysBetween(x.s.start, g.date) < minGap))
      j.check(s.durMin <= 0.75 * peak, () => ({
        week,
        rule: "P18",
        detail: `sortie longue de ${r0(s.durMin)} min à J-${daysBetween(s.start, g.date)} (plus longue : ${r0(peak)} min)`,
        severity: "mineure",
      }));
  return {
    id: "affutage",
    label: "Affûtage et semaine de course",
    source: "P18 Bosquet 2007 ; H12 ; P24 ; Pfitzinger",
    ...j.done(),
  };
}

/** K9: product principle 3 (one decision a day, no over-adaptation), Garmin Run Coach's main reproach (research 05 §1.1). */
function stability(r: RunLog): Criterion {
  const j = judge();
  r.weeks.forEach((w, i) => {
    j.check(w.autoChanges <= 2, () => ({
      week: w.week,
      rule: "D7 / EV15",
      detail: `${w.autoChanges} changements automatiques`,
      severity: "mineure",
    }));
    const prev = r.weeks[i - 1];
    const l = w.built.find((s) => s.type === "L");
    const pl = prev?.built.find((s) => s.type === "L");
    if (l && pl)
      j.check(weekday(l.start) === weekday(pl.start), () => ({
        week: w.week,
        rule: "S9",
        detail: `sortie longue passée du ${pl.start.slice(5, 10)} au ${l.start.slice(5, 10)}`,
        severity: "mineure",
      }));
  });
  return {
    id: "stabilite",
    label: "Stabilité",
    source: "principe produit 3 ; S9 Bruggisser 2023 ; reproche Garmin Run Coach",
    ...j.done(),
  };
}

/** K10: P13 (one run per planned slot), catalog caps (E 30 to 75 min, RECUP 20 to 40, Daniels), A4 (nothing dropped). */
function structure(r: RunLog): Criterion {
  const j = judge();
  const n = r.persona.settings.runsPerWeek;
  for (const w of r.weeks) {
    // P23: the week after the race is made of short footings by design.
    if (afterRace(r, w)) continue;
    j.check(w.built.length === n, () => ({
      week: w.week,
      rule: "P13 / A4",
      detail: `${w.built.length} séances pour ${n} prévues`,
      severity: "majeure",
    }));
    for (const s of w.built.filter((x) => x.type === "E"))
      j.check(Math.round(s.durMin) >= 30 && Math.round(s.durMin) <= 75, () => ({
        week: w.week,
        rule: "P15 / catalogue E",
        detail: `${s.type} de ${r0(s.durMin)} min (catalogue : 30 à 75)`,
        severity: "mineure",
      }));
  }
  return { id: "structure", label: "Structure de la semaine", source: "P13, P15, catalogue M3 (Daniels)", ...j.done() };
}

const lastWeeks = (r: RunLog, w: WeekLog, days: number): WeekLog[] =>
  r.weeks.filter((x) => x.week <= w.week && daysBetween(x.monday, w.monday) < days);
const AT_MOST_AMBITIOUS = ["conservateur", "réaliste", "ambitieux"];

/**
 * P21: race-pace blocks follow her target only when it is at most ambitious, else the time her level predicts; from
 * the half up, never faster than her T pace of the week (Daniels: T is the pace held about an hour).
 */
function racePace(r: RunLog, vdotNow: number): number {
  const g = r.persona.goal;
  const min =
    g.targetMin && AT_MOST_AMBITIOUS.includes(r.feasibility) ? g.targetMin : predictTime(vdotNow, g.distanceM);
  const pace = (min * 60) / (g.distanceM / 1000);
  return g.distanceM >= 21097.5 ? Math.max(pace, daniels(vdotNow).T) : pace;
}

/** TR3: every pace a built session aims at comes from the level of that week (F7), race pace from P21. */
function pacesOfWeek(j: Judge, r: RunLog, w: WeekLog): void {
  const p = daniels(w.vdotStart);
  // A test aims at the pace of 20 min all out (catalogue TEST), not a training zone.
  for (const s of runs(w).filter((x) => x.type !== "TEST"))
    for (const st of s.steps) {
      const pace = st.target.paceSKm?.[0];
      const zone = st.zone;
      if (pace === undefined || (zone !== "T" && zone !== "I" && zone !== "race")) continue;
      const want = zone === "race" ? racePace(r, w.vdotStart) : p[zone];
      j.check(Math.abs(pace - want) <= 3, () => ({
        week: w.week,
        rule: "P21 / F7",
        detail: `${s.type} : allure ${zone} de ${r0(pace)} s/km pour ${r0(want)} attendues (niveau ${w.vdotStart.toFixed(1)}, objectif ${r.feasibility})`,
        severity: "critique",
      }));
    }
}

/**
 * K11, does the programme lead to the goal: research 02 R23 and Daniels (her level re-estimated every 4 to 6 weeks, so the paces
 * follow her progress), P11 and Muñoz 2014 (a build week she follows carries a quality session: no stimulus, no
 * progression), P21 (paces from her level, race pace from the goal only when it is at most ambitious) and P10 (never
 * more than the periodised plan asks: too aggressive). Her level rises with what she runs (sim.ts `progress`).
 */
function trajectory(r: RunLog): Criterion {
  const j = judge();
  const acts = allRuns(r);
  r.weeks.forEach((w, i) => {
    if (afterRace(r, w) || isRaceWeek(r, w)) return;
    // P26: Daniels re-sets the VDOT every 4 to 6 weeks, on a race or on sessions; a test after 6 weeks without.
    if (w.week >= 7 && !isTaper(w)) {
      const recent = lastWeeks(r, w, 42);
      const from = recent[0]?.monday ?? w.monday;
      const tested = acts.some(
        (a) => (a.isTest || a.isRace) && dateOf(a.start) >= from && dateOf(a.start) < addDays(w.monday, 7),
      );
      // The app plans the test; a morning decision may still lighten it (D3), which is no fault of the plan.
      const planned = recent.some((x) => x.built.some((s) => s.type === "TEST"));
      j.check(tested || planned || recent.some((x) => x.proposals.length > 0), () => ({
        week: w.week,
        rule: "R23 / P26",
        detail: `niveau ni testé ni réévalué depuis 6 semaines (app ${w.vdotEnd.toFixed(1)}, réel ${w.trueVdot.toFixed(1)})`,
        severity: "majeure",
      }));
    }
    const prev = r.weeks[i - 1];
    const build = /^(dev|spe)/.test(w.phase) && !w.phase.includes("décharge");
    if (prev && build && done(prev) >= 0.9 * minutes(runs(prev)))
      j.check(
        runs(w).some((s) => isHard(s) && s.type !== "L"),
        () => ({ week: w.week, rule: "P11", detail: `aucune séance de qualité en ${w.phase}`, severity: "majeure" }),
      );
    // P9: a deload week is one (volume × 0.75): above its plan it is a load week in disguise, too aggressive.
    if (w.planMin > 0 && w.phase.includes("décharge"))
      j.check(minutes(runs(w)) <= 1.1 * w.planMin + 1, () => ({
        week: w.week,
        rule: "P9",
        detail: `semaine de décharge : ${r0(minutes(runs(w)))} min construites pour ${r0(w.planMin)} au plan`,
        severity: "majeure",
      }));
    pacesOfWeek(j, r, w);
  });
  return {
    id: "trajectoire",
    label: "Trajectoire vers l'objectif",
    source: "R23 recherche 02, P26 Daniels ; P11, Muñoz 2014 ; P21 Daniels ; P10",
    ...j.done(),
  };
}

/** The session a run was matched to (the bench names runs after their session). */
const sessionOf = (w: WeekLog, a: Activity): Session | undefined => w.final.find((s) => `run-${s.id}` === a.id);

/**
 * K12, the week follows what she ran: AD3 (research 03 §8.2: never two hard days in a row, her own hard runs
 * included), AD5 and EV16 (nothing made up: no session grows), AD4 and G2 (what she ran counts in the week).
 */
function adaptation(r: RunLog): Criterion {
  const j = judge();
  const acts = allRuns(r);
  for (const w of r.weeks) {
    const p = daniels(w.vdotStart);
    const hard = (a: Activity): boolean => readRun(a, p, r.persona.hrMax).hard;
    const ran = [...w.activities].sort((a, b) => a.start.localeCompare(b.start));
    ran.forEach((a, i) => {
      const planned = sessionOf(w, a);
      if (!hard(a) || (planned && isHard(planned))) return;
      const next = ran[i + 1];
      const nextSession = next && sessionOf(w, next);
      if (next && nextSession && isHard(nextSession) && hoursBetween(a.start, next.start) < 36)
        j.check(!hard(next), () => ({
          week: w.week,
          rule: "AD3",
          detail: `${nextSession.type} ${next.start.slice(5)} couru le lendemain d'une course rapide non prévue (${a.start.slice(5)})`,
          severity: "majeure",
        }));
    });
    for (const s of w.final) {
      const b = w.built.find((x) => x.id === s.id);
      if (b && s.status !== "skipped")
        j.check(s.durMin <= b.durMin + 0.5, () => ({
          week: w.week,
          rule: "AD5 / EV16",
          detail: `${s.type} ${s.start.slice(5)} allongée de ${r0(b.durMin)} à ${r0(s.durMin)} min dans la semaine`,
          severity: "critique",
        }));
    }
    const ranIn = (monday: string): number =>
      sum(acts.filter((a) => a.start >= monday && a.start < addDays(monday, 7)).map((a) => a.durMin));
    const chronic = Math.max(...[1, 2, 3, 4].map((k) => ranIn(addDays(w.monday, -7 * k))));
    const extra = w.activities.some((a) => !sessionOf(w, a));
    if (extra && chronic > 0)
      j.check(done(w) <= 1.1 * chronic + 10, () => ({
        week: w.week,
        rule: "AD4 / G2",
        detail: `${r0(done(w))} min courues pour un plafond de ${r0(1.1 * chronic)} min`,
        severity: "mineure",
      }));
  }
  return {
    id: "adaptation",
    label: "Adaptation au réalisé",
    source: "AD3 recherche 03 §8.2, Seiler 2010 ; AD4 G2 Damsted 2019 ; AD5 EV16 Runna",
    ...j.done(),
  };
}

const QUALITY = ["FARTLEK", "T", "CRUISE", "I", "R", "SPE", "TEST"];
const workAt = (s: Session, zone: string): number =>
  sum(s.steps.filter((st) => st.kind === "work" && st.zone === zone).map((st) => st.durMin * (st.reps ?? 1)));
/** Threshold minutes of a week (T and CRUISE work), printed by `--weeks`. */
export const thresholdMin = (list: Session[]): number => sum(list.map((s) => workAt(s, "T")));
const isLoad = (w: WeekLog): boolean => /^(dev|spe)/.test(w.phase) && !w.phase.includes("décharge");
const hardQ = (s: Session): boolean => isHard(s) && s.type !== "L" && s.type !== "TEST" && s.type !== "RACE";
/** The week's quality sessions as their shape, to tell two weeks apart (G3). */
const shape = (w: WeekLog): string =>
  runs(w)
    .filter((s) => QUALITY.includes(s.type))
    .map((s) => `${s.type}:${s.steps.map((st) => `${st.reps ?? 1}×${Math.round(st.durMin)}`).join()}`)
    .sort()
    .join("|");

/** P6: at least 3 runs a week over the 8 weeks before the day the programme starts (its runs come after). */
const regularBefore = (r: RunLog): boolean =>
  r.history.filter((a) => !a.isRace && a.start < PLAN_START && daysBetween(a.start, PLAN_START) < 56).length >= 24;
const withStrides = (s: Session): boolean =>
  s.type === "E" && s.steps.some((st) => st.kind === "work") && s.steps.some((st) => st.kind === "strides");

/**
 * K13, what the weeks hold: P6 (a regular runner gets her first quality session in week 2: Daniels' phase I shortened,
 * Runna and Campus Coach), P12 (threshold at 20 min at least: Daniels, McMillan, Pfitzinger; strides each week:
 * Daniels, Pfitzinger, Runna; no three identical load weeks: Runna, Nike), P26 (a test at most every 6 weeks, never
 * her first hard run, never next to another Q in a deload: Daniels, Runna).
 */
function content(r: RunLog): Criterion {
  const j = judge();
  const weeks = r.weeks.filter((w) => !afterRace(r, w) && !isRaceWeek(r, w));
  const firstQ = weeks.find((w) => runs(w).some((s) => QUALITY.includes(s.type)));
  if (regularBefore(r) && r.planWeeks >= 10)
    j.check((firstQ?.week ?? 99) <= 2, () => ({
      week: firstQ?.week ?? 0,
      rule: "P6",
      detail: `première séance de qualité en semaine ${firstQ?.week ?? "aucune"} pour une coureuse régulière`,
      severity: "majeure",
    }));
  weeks.forEach((w, i) => {
    // P16 keeps the floor; a G2 to G4 cap (a week she did not fully run) may still shorten a Q (trimTo).
    const prev = weeks[i - 1];
    const uncapped = prev !== undefined && done(prev) >= 0.9 * minutes(runs(prev));
    // With no other quality or race-pace block to cut first, P16 lets the threshold give.
    const others = (x: Session): boolean =>
      runs(w).some((o) => o !== x && (QUALITY.includes(o.type) || o.steps.some((st) => st.zone === "race")));
    for (const s of runs(w).filter(
      (x) => uncapped && isLoad(w) && (x.type === "T" || x.type === "CRUISE") && others(x),
    ))
      j.check(workAt(s, "T") >= 19.5, () => ({
        week: w.week,
        rule: "P12 / P16",
        detail: `${s.type} de ${r0(workAt(s, "T"))} min au seuil (au moins 20)`,
        severity: "majeure",
      }));
    if (/^(dev|spe)/.test(w.phase))
      j.check(runs(w).some(withStrides), () => ({
        week: w.week,
        rule: "P12",
        detail: "aucune ligne droite dans la semaine",
        severity: "mineure",
      }));
    const test = runs(w).find((s) => s.type === "TEST");
    if (test && w.phase.includes("décharge"))
      j.check(!runs(w).some(hardQ), () => ({
        week: w.week,
        rule: "P26 / P9",
        detail: "test dans une semaine de décharge avec une autre séance dure",
        severity: "majeure",
      }));
    // F10 tests a provisional level in weeks 2 to 4 on purpose.
    if (test && r.initial.status !== "provisional")
      j.check(
        weeks.slice(0, i).some((x) => runs(x).some(hardQ)),
        () => ({ week: w.week, rule: "P26", detail: "test comme première séance dure", severity: "majeure" }),
      );
    const [a, b] = [weeks[i - 2], weeks[i - 1]];
    if (a && b && [a, b, w].every(isLoad) && shape(w) !== "")
      j.check(!(shape(a) === shape(b) && shape(b) === shape(w)), () => ({
        week: w.week,
        rule: "P12 (variété)",
        detail: "trois semaines de charge avec les mêmes séances de qualité",
        severity: "mineure",
      }));
  });
  const tests = weeks.filter((w) => runs(w).some((s) => s.type === "TEST")).length;
  if (r.initial.status !== "provisional")
    j.check(tests <= Math.ceil(weeks.length / 6), () => ({
      week: 0,
      rule: "P26",
      detail: `${tests} tests en ${weeks.length} semaines (au plus un toutes les 6)`,
      severity: "majeure",
    }));
  return {
    id: "contenu",
    label: "Contenu des séances",
    source: "P6 Daniels, Runna ; P12 Daniels, McMillan, Pfitzinger ; P26 Daniels",
    ...j.done(),
  };
}

export const CRITERIA = [
  volume,
  intensity,
  longRun,
  spacing,
  paces,
  health,
  skipped,
  taper,
  stability,
  structure,
  trajectory,
  adaptation,
  content,
];

const WEIGHT: Record<Severity, number> = { critique: 3, majeure: 1, mineure: 0.3 };

/**
 * 10 minus the weighted share of failed checks; one critical failure caps the criterion at 4, since a coach would
 * not let such a week through whatever the rest looks like.
 */
export function score(c: Criterion): number | null {
  if (c.checks === 0) return null;
  const penalty = sum(c.failures.map((f) => WEIGHT[f.severity])) / c.checks;
  const raw = Math.max(0, 10 * (1 - penalty));
  const capped = c.failures.some((f) => f.severity === "critique") ? Math.min(4, raw) : raw;
  return Math.round(10 * capped) / 10;
}
