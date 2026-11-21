import { addDays, at } from "../src/dates.ts";
import type { Activity, Lap } from "../src/types.ts";

/**
 * Anna 4 weeks after a 4:06 marathon (audit of 21/11/2026), as the 12-month backfill stores it: 1 km laps over the
 * last 84 days, 0.25 % of climb, no temperature. 3 runs a week until July with a 1:50 half on 12/04, a 16-week
 * marathon block (4 runs, a threshold or a marathon-pace run every other week), the marathon on 25/10 (42.4 km,
 * heart rate drifting from 158 to 175 of 192), then 2 to 3 easy runs a week. `lastTempo: false` drops the
 * threshold run of 14/10: her last threshold is then 52 days before 21/11.
 */
export function marathonReturn(opts: { lastTempo: boolean } = { lastTempo: true }): Activity[] {
  const acts: Activity[] = [];
  const lapsFrom = "2026-08-29";
  const run = (date: string, parts: [number, number, number][], isRace = false): void => {
    const laps: Lap[] = [];
    for (const [km, pace, hr] of parts)
      for (let left = km; left > 0.001; left -= 1) {
        const d = Math.min(1, left);
        laps.push({ distM: d * 1000, durMin: (d * pace) / 60, avgHr: hr });
      }
    const durMin = laps.reduce((s, l) => s + l.durMin, 0);
    const distM = laps.reduce((s, l) => s + l.distM, 0);
    const avgHr = Math.round(laps.reduce((s, l) => s + (l.avgHr ?? 0) * l.durMin, 0) / durMin);
    acts.push({
      id: `h${acts.length}`,
      start: at(date, "18:00"),
      durMin,
      distM,
      avgHr,
      elevGainM: distM / 400,
      ...(date >= lapsFrom ? { laps } : {}),
      ...(isRace ? { isRace } : {}),
    });
  };
  const E = 380;
  const ehr = 142;
  for (let m = "2025-11-24"; m < "2026-07-06"; m = addDays(m, 7)) {
    if (m === "2026-04-06") {
      run(addDays(m, 1), [[6, E, ehr]]);
      run(addDays(m, 3), [[5, E, ehr]]);
      run(addDays(m, 6), [[21.1, 312.8, 172]], true);
      continue;
    }
    run(addDays(m, 1), [[6.5, E, ehr]]);
    run(addDays(m, 3), [[6.5, E, ehr]]);
    run(addDays(m, 6), [[11, 385, 146]]);
  }
  const total = [35, 37, 39, 34, 40, 42, 44, 38, 45, 47, 50, 42, 48, 40, 32];
  const longKm = [18, 20, 22, 18, 24, 26, 28, 22, 28, 30, 32, 24, 30, 22, 16];
  total.forEach((km, w) => {
    const m = addDays("2026-07-06", 7 * w);
    const tempo = w % 2 === 0 && (opts.lastTempo || w !== 14);
    const work = tempo ? 5 + Math.min(3, Math.floor(w / 4)) : 8 + Math.min(6, w);
    const long = longKm[w] ?? 20;
    const easy = Math.max(6, (km - long - work - 4) / 2);
    run(addDays(m, 1), [[easy, E, ehr]]);
    run(addDays(m, 2), [[2, E, ehr], tempo ? [work, 312, 170] : [work, 348, 161], [2, E, 150]]);
    run(addDays(m, 4), [[easy, E, ehr]]);
    run(addDays(m, 6), [[long, 385, 148]]);
  });
  run("2026-10-20", [[8, E, ehr]]);
  run("2026-10-22", [
    [2, E, ehr],
    [3, 348, 160],
    [1, E, 148],
  ]);
  const marathon: [number, number, number][] = [];
  for (let k = 1; k <= 42; k++) {
    const pace = k <= 25 ? 340 : k <= 35 ? 350 : 375;
    const hr = k <= 10 ? 158 + k * 0.4 : k <= 25 ? 163 + (k - 10) * 0.33 : 169 + (k - 25) * 0.35;
    marathon.push([1, pace, Math.round(hr)]);
  }
  marathon.push([0.4, 375, 175]);
  run("2026-10-25", marathon, true);
  const after: [string, number, number, number][] = [
    ["2026-10-29", 4, 395, 140],
    ["2026-10-31", 5, 395, 140],
    ["2026-11-03", 5.5, 390, 141],
    ["2026-11-05", 5.5, 390, 141],
    ["2026-11-08", 7, 390, 142],
    ["2026-11-10", 6, E, 142],
    ["2026-11-12", 6.5, E, 142],
    ["2026-11-15", 8, E, 143],
    ["2026-11-18", 6.5, E, 142],
    ["2026-11-20", 7, E, 142],
  ];
  for (const [d, km, pace, hr] of after) run(d, [[km, pace, hr]]);
  return acts;
}
