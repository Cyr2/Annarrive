import {
  addDays,
  addMinutes,
  dayName,
  daysBetween,
  duration,
  isoWeek,
  minutesOf,
  mondayOf,
  relativeDay,
  toIso,
} from "../../lib/date.ts";
import type { Api } from "../client.ts";
import type { Activity, CalendarEvent, ChangeRow, Item, Program, Proposal, RaceResult, Run } from "../schemas.ts";
import { chatDay, type ReggieMemory, reggie } from "./chat.ts";
import { seedLevel } from "./level.ts";
import { seedProgression } from "./progression.ts";
import { applyChange, blockedDays, changeOptions, isRun, proposeSlots } from "./rules.ts";
import { seedProgram, seedWeek, strengthEvent } from "./seed.ts";
import { applyUnavailable } from "./unavailable.ts";
import {
  dismissReview,
  LONG_ACTIVITY,
  mockReview,
  RACE,
  RACE_ACTIVITY,
  recoveryWeek,
  reviewDismissed,
  withoutRunOn,
} from "./weekend.ts";
import { worstItems, worstProgram } from "./worst.ts";

/**
 * Which "today" the mock shows: the states of the mockups (Main, Repos, Apres), a lightened session,
 * `worst`, the longest realistic values (break-ui check), `didyourun` (a run before today is over and unmatched)
 * `proposal` (Reggie proposes a new level), `bilan` (Sunday evening, the week's review), `lundi` (the Monday after it, its
 * review still open above the day's run) and `course` (the goal race
 * just synced).
 */
export type Scenario =
  | "run"
  | "rest"
  | "done"
  | "light"
  | "worst"
  | "didyourun"
  | "proposal"
  | "bilan"
  | "lundi"
  | "course";

type State = {
  weeks: Record<string, Item[]>;
  program: Program;
  activity?: Activity;
  refreshed: boolean;
  unwell?: boolean;
  proposals: Proposal[];
  race?: RaceResult;
};

const PROPOSAL: Proposal = {
  id: "p-1",
  text: "Tes dernières séances rapides sont bien passées : je te propose des allures un peu plus vives.",
};

const ACTIVITY: Activity = {
  id: "a-1",
  title: "Fractionné fait",
  receivedAt: "18:04",
  distanceKm: 8.3,
  duration: "51:12",
  mainPaceLabel: "Allure 800 m",
  mainPace: "4'52 /km",
  verdict: "Cible 4'55 /km tenue sur les 6 fractions",
  askFeel: true,
  intensity: "hard",
};

/** The run already synced today, by scenario. */
const RUN_DONE: Partial<Record<Scenario, Activity>> = { done: ACTIVITY, course: RACE_ACTIVITY, bilan: LONG_ACTIVITY };

export type MockOptions = { scenario?: Scenario; monday?: string; latencyMs?: number };

export function createMockApi({
  scenario = "run",
  monday = mondayOf(toIso(new Date())),
  latencyMs = 0,
}: MockOptions = {}) {
  const weekend = scenario === "bilan" || scenario === "course";
  // The week whose review is open: this one on Sunday evening, last week on the Monday after.
  const reviewed = scenario === "bilan" ? monday : scenario === "lundi" ? addDays(monday, -7) : undefined;
  const today =
    scenario === "rest" || scenario === "didyourun" ? addDays(monday, 1) : weekend ? addDays(monday, 6) : monday;
  const seeded = seedProgram(scenario === "course" ? today : addDays(monday, 62), new Date());
  const program = scenario === "worst" ? worstProgram(seeded) : seeded;
  const state: State = {
    weeks: {},
    program,
    refreshed: false,
    activity: RUN_DONE[scenario],
    proposals: scenario === "proposal" ? [PROPOSAL] : [],
    race: scenario === "course" ? { ...RACE, date: today } : undefined,
  };
  const log = new Map<string, State>();
  const memory: ReggieMemory = { count: 0 };
  let seq = 0;

  const wait = () => new Promise((resolve) => setTimeout(resolve, latencyMs));
  const week = (date: string) => {
    const key = mondayOf(date);
    const seed = () => seedWeek(key, state.program.strength);
    state.weeks[key] ??= scenario === "worst" ? worstItems(seed(), key, monday) : seed();
    return state.weeks[key];
  };
  const all = () => Object.values(state.weeks).flat();
  const find = (id: string) => {
    const item = all().find((i) => i.id === id);
    if (!item) throw new Error(`Élément introuvable : ${id}`);
    return item;
  };
  const findRun = (id: string) => {
    const item = find(id);
    if (!isRun(item)) throw new Error(`Pas une course : ${id}`);
    return item;
  };
  const remove = (id: string) => {
    for (const key of Object.keys(state.weeks)) state.weeks[key] = (state.weeks[key] ?? []).filter((i) => i.id !== id);
  };
  const put = (item: Item) => {
    remove(item.id);
    week(item.date).push(item);
  };
  const removeStrength = (templateId: string, from: string) => {
    for (const i of all()) if (i.kind === "strength" && i.templateId === templateId && i.date >= from) remove(i.id);
  };
  const commit = async (message: string, mutate: () => ChangeRow[] | undefined) => {
    await wait();
    const before = structuredClone(state);
    const rows = mutate() ?? [];
    const changeId = `c${++seq}`;
    log.set(changeId, before);
    return { changeId, message, rows };
  };
  const runRow = (run: Run, label = `${run.title} · ${run.start}`): ChangeRow => ({
    day: relativeDay(run.date, today),
    label,
    tone: run.intensity,
  });

  week(today);
  if (scenario === "course") state.weeks[monday] = withoutRunOn(week(today), today);
  if (scenario === "light") {
    const run = findRun(`${monday}-2`);
    put({
      ...applyChange(run, "shorter"),
      watch: "failed",
      lightened: "Allégée : nuit courte et fréquence cardiaque au repos plus haute que d'habitude",
    });
  }

  const api: Api = {
    mode: "mock",
    async today() {
      await wait();
      const runs = week(today)
        .filter(isRun)
        .concat(week(addDays(today, 7)).filter(isRun));
      const session = state.activity ? undefined : runs.find((r) => r.date === today);
      const next = runs.filter((r) => r.date > today).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
      return {
        date: today,
        goal: {
          label: state.program.goal.name ?? goalLabel(state.program.goal.race),
          daysLeft: daysBetween(today, state.program.goal.date),
        },
        session,
        next,
        activity: state.activity,
        unwell: state.unwell,
        proposals: state.proposals,
        // The last run before today, still on the plan: the screen asks whether she ran it.
        toConfirm: scenario === "didyourun" ? runs.findLast((r) => r.date < today) : undefined,
        review:
          reviewed && !reviewDismissed(isoWeek(reviewed))
            ? mockReview(reviewed, week(reviewed), week(addDays(reviewed, 7)), scenario === "lundi")
            : undefined,
        race: state.race,
      };
    },
    async week(offset) {
      await wait();
      const key = addDays(mondayOf(today), offset * 7);
      const index = state.program.weekIndex + offset;
      return {
        monday: key,
        index: index >= 1 && index <= state.program.weekTotal ? index : undefined,
        total: state.program.weekTotal,
        readOnly: offset < 0,
        timetableCheckedAt: state.program.timetableCheckedAt,
        items: structuredClone(week(key)),
      };
    },
    program: async () => structuredClone(state.program),
    async progression() {
      await wait();
      return state.program.maintenance ? null : seedProgression(monday, state.program.goal.date);
    },
    async level() {
      await wait();
      return seedLevel(monday);
    },

    // shortcut: the mock puts each event once, in its first week, without its repeats.
    addEvent: (input) => {
      const all = [input].flat();
      const first = all[0];
      const said = first ? `${first.title}, ${dayName(first.date).toLowerCase()} ${first.start}` : "";
      return commit(`Ajouté à ta semaine : ${said}`, () =>
        all.flatMap(({ until: _until, exceptions: _exceptions, repeat: _repeat, ...event }, i) => {
          put({ ...event, id: `e${Date.now()}${seq}${i}` });
          return clearConflicts(event.date, event.start, event.end);
        }),
      );
    },
    updateEvent: (id, { hours, ...patch }) =>
      commit(patch.cancelled ? "Cours marqué comme annulé, le créneau est libre" : "Modification enregistrée", () => {
        const item = find(id);
        if (isRun(item)) throw new Error("Une course se change avec Déplacer ou Changer");
        put({ ...item, ...patch, ...hours });
        return undefined;
      }),
    deleteEvent: (id, scope) =>
      commit("Séance supprimée", () => {
        const item = find(id);
        if (scope === "all" && item.kind === "strength" && item.templateId) removeStrength(item.templateId, "");
        remove(id);
        return undefined;
      }),
    saveStrength: (template) =>
      commit(`${template.name} enregistrée`, () => {
        state.program.strength = [...state.program.strength.filter((t) => t.id !== template.id), template];
        removeStrength(template.id, today);
        if (template.placed) put(strengthEvent(template, mondayOf(today)));
        return undefined;
      }),
    deleteStrength: (id, scope) =>
      commit("Séance de muscu supprimée", () => {
        if (scope === "all") state.program.strength = state.program.strength.filter((t) => t.id !== id);
        removeStrength(id, today);
        return undefined;
      }),

    async moveOptions(id) {
      await wait();
      const run = findRun(id);
      const items = week(run.date);
      return {
        slots: proposeSlots(run, items, state.program.settings, today),
        blocked: blockedDays(run, items, state.program.settings, today, mondayOf(run.date)),
      };
    },
    move: (id, slot) =>
      commit(`Séance déplacée à ${relativeDay(slot.date, today).toLowerCase()} ${slot.start}`, () => {
        const item = find(id);
        if (!isRun(item)) {
          put({ ...item, ...slot, end: addMinutes(slot.start, minutesOf(item.end) - minutesOf(item.start)) });
          return undefined;
        }
        // Two runs never share a day: the one already there takes the freed day.
        const bumped = week(slot.date).find((i) => isRun(i) && i.date === slot.date && i.id !== id);
        if (bumped) put({ ...bumped, date: item.date });
        const moved: Run = { ...item, ...slot, watch: "synced" };
        put(moved);
        const was = runRow(item);
        if (item.date === slot.date) return [{ ...runRow(moved), before: was.label }];
        // Another day: the day she left, then the day she goes to.
        const swapped = bumped && isRun(bumped) ? runRow({ ...bumped, date: item.date }) : undefined;
        return [
          { ...(swapped ?? { day: was.day, label: "Repos", tone: "rest" }), before: was.label },
          { ...runRow(moved), before: swapped?.label ?? "Repos" },
        ];
      }),
    async changeOptions(id) {
      await wait();
      return changeOptions(findRun(id));
    },
    change: (id, option) =>
      commit("Séance changée, ta montre est à jour", () => {
        const was = findRun(id);
        const run = applyChange(was, option);
        put(run);
        return [
          {
            ...runRow(run, `${run.title} · ${duration(run.durationMin)}`),
            before: `${was.title} · ${duration(was.durationMin)}`,
          },
        ];
      }),
    async previewUnavailable(input) {
      await wait();
      return applyUnavailable(all(), input, today).rows;
    },
    unavailable: (input) =>
      commit("Ta semaine est adaptée", () => {
        const { items, rows } = applyUnavailable(all(), input, today);
        for (const key of Object.keys(state.weeks)) state.weeks[key] = items.filter((i) => mondayOf(i.date) === key);
        if (input.reason === "sick" || input.reason === "pain") state.unwell = true;
        return rows;
      }),
    skip: (id) =>
      commit("Séance sautée", () => {
        remove(id);
        return undefined;
      }),
    confirmDone: (id) =>
      commit("Séance faite", () => {
        remove(id);
        return undefined;
      }),
    feelBetter: () =>
      commit("Ça va mieux : 3 jours de footing tranquille, puis tes séances reprennent", () => {
        state.unwell = false;
        return undefined;
      }),
    acceptProposal: (id) =>
      commit("Allures mises à jour", () => {
        state.proposals = state.proposals.filter((p) => p.id !== id);
        return undefined;
      }),
    declineProposal: (id) =>
      commit("Proposition refusée", () => {
        state.proposals = state.proposals.filter((p) => p.id !== id);
        return undefined;
      }),
    async undo(changeId) {
      await wait();
      const before = log.get(changeId);
      if (!before) throw new Error("Rien à annuler");
      Object.assign(state, structuredClone(before));
      log.delete(changeId);
    },

    async refreshTimetable() {
      await wait();
      state.program.timetableCheckedAt = new Date().toISOString();
      if (state.refreshed) return { checkedAt: state.program.timetableCheckedAt };
      state.refreshed = true;
      const thursday = week(today).find(
        (i): i is CalendarEvent => i.kind === "class" && i.title === "UE3 Mathématiques",
      );
      if (thursday) put({ ...thursday, cancelled: true });
      return { checkedAt: state.program.timetableCheckedAt, summary: "1 cours annulé jeudi" };
    },
    async setTimetableUrl(url) {
      state.program.timetableUrl = url;
      return api.refreshTimetable();
    },
    updateSettings: (patch) =>
      commit("Reggie a réorganisé ta semaine", () => {
        state.program.settings = { ...state.program.settings, ...patch };
        return undefined;
      }),
    updateGoal: (goal) =>
      commit("Objectif mis à jour, les semaines à venir sont recalculées", () => {
        const tag = goal.targetTime ? targetTag(goal.targetTime, goal.distanceKm) : undefined;
        state.program.goal = { ...goal, targetTag: tag };
        state.program.maintenance = false;
        state.race = undefined;
        return undefined;
      }),
    updateLastTime: (time) =>
      commit("Allures recalculées avec ton chrono", () => {
        state.program.lastTime = time;
        return undefined;
      }),
    stopProgram: () =>
      commit("Programme arrêté, place au mode entretien", () => {
        state.program.maintenance = true;
        return undefined;
      }),
    dismissReview: async (week) => {
      await wait();
      dismissReview(week);
    },
    keepFit: () =>
      commit("Mode entretien : footings faciles pour commencer", () => {
        state.program.maintenance = true;
        state.race = undefined;
        const next = addDays(mondayOf(today), 7);
        state.weeks[next] = recoveryWeek(week(next));
        return undefined;
      }),
    reconnectWatch: async () => {
      await wait();
      state.program.watch = { ...state.program.watch, connected: true, lastSync: new Date().toISOString() };
    },
    resendToWatch: async (id) => {
      await wait();
      put({ ...findRun(id), watch: "synced" });
    },
    logFeel: async (_id, feel) => {
      await wait();
      if (state.activity) state.activity = { ...state.activity, feel };
    },
    chat: (input) => reggie(api, input, { today, latencyMs, memory }),
    chatHistory: async (day) => chatDay(today, day),
    // No VAPID key: the mock hides the notifications switch, as a server without keys does.
    pushKey: async () => null,
    subscribePush: async () => undefined,
    unsubscribePush: async () => undefined,
  };

  /** A new busy slot over a run pushes the run after it, or to the next morning. */
  function clearConflicts(date: string, start: string, end: string): ChangeRow[] {
    const run = week(date).find((i): i is Run => isRun(i) && overlaps(i, start, end));
    if (!run) return [];
    const after = addMinutes(end, 30);
    const fits = minutesOf(after) + run.durationMin <= minutesOf(state.program.settings.notAfter);
    const moved = fits ? { ...run, start: after } : { ...run, date: addDays(date, 1), start: "7:30" };
    put(moved);
    return [runRow(moved)];
  }

  return api;
}

/** shortcut: "Ambitieux" under 5:00 /km, "Atteignable" otherwise; the server's estimate replaces it. */
function targetTag(time: string, distanceKm: number) {
  const [h = 0, m = 0, sec = 0] = time.split(":").map(Number);
  const secondsPerKm = (h * 3600 + m * 60 + sec) / distanceKm;
  return secondsPerKm < 300 ? "ambitious" : "reachable";
}

/** The race's short name in the day's answer ("Semi"), as the server gives it. */
function goalLabel(race: string) {
  return race === "Semi-marathon" ? "Semi" : race;
}

function overlaps(run: Run, start: string, end: string) {
  const from = minutesOf(run.start);
  return from < minutesOf(end) && from + run.durationMin > minutesOf(start);
}
