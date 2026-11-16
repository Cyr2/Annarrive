import { describe, expect, it, vi } from "vitest";
import { createMockOnboardingApi, type OnboardingApi } from "../../api/onboarding.ts";
import { DONE_KEY } from "./done.ts";
import { COPY, EMPTY, firstDay, STEPS, toPayload } from "./onboarding.ts";
import { createOnboardingStore } from "./store.ts";

// Monday 16 November 2026.
const TODAY = "2026-11-16";

function setup(over: Partial<OnboardingApi> = {}, search = "?onboarding") {
  const base = { ...createMockOnboardingApi(search), ...over };
  const calls: string[] = [];
  const spy = <A>(name: string, fn: (arg: A) => Promise<void>) =>
    vi.fn(async (arg: A) => {
      calls.push(name);
      await fn(arg);
    });
  const api = {
    ...base,
    saveProgram: spy("saveProgram", base.saveProgram),
    addEvent: spy("addEvent", base.addEvent),
    reportPain: spy("reportPain", base.reportPain),
    saveProfile: spy("saveProfile", base.saveProfile),
  };
  const storage = { setItem: vi.fn() };
  const store = createOnboardingStore(async () => api, storage, TODAY);
  return { api, calls, storage, store };
}

describe("onboarding store", () => {
  it("shows the flow only when the server says it is not done, and remembers when it is", async () => {
    const todo = setup();
    await todo.store.getState().start();
    expect(todo.store.getState().phase).toBe("flow");
    const done = setup({}, "");
    await done.store.getState().start();
    expect(done.store.getState().phase).toBe("hidden");
    expect(done.storage.setItem).toHaveBeenCalledWith(DONE_KEY, "done");
  });

  it("never blocks the app when the server does not answer", async () => {
    const { store } = setup({ done: () => Promise.reject(new Error("offline")) });
    await store.getState().start();
    expect(store.getState().phase).toBe("hidden");
  });

  it("asks for the race before going on, and skips the target in maintenance mode", () => {
    const { store } = setup();
    const s = () => store.getState();
    s().next();
    expect(s().step).toBe("race");
    s().next();
    expect(s().step).toBe("race");
    s().update({ race: 10000, date: "2026-11-10" });
    s().next();
    expect(s().step).toBe("race");
    s().update({ race: "none" });
    s().next();
    expect(s().step).toBe("runs");
    s().back();
    expect(s().step).toBe("race");
    expect(s().direction).toBe(-1);
  });

  it("keeps enough days to run and a sane window", () => {
    const { store } = setup();
    const s = () => store.getState();
    store.setState({ step: "limits" });
    s().update({ noRunDays: [1, 2, 3, 4, 5], runsPerWeek: 3 });
    s().next();
    expect(s().step).toBe("limits");
    s().update({ noRunDays: [1], earliest: "21:00", latestEnd: "7:00" });
    s().next();
    expect(s().step).toBe("limits");
    s().update({ earliest: "7:00", latestEnd: "21:30" });
    s().next();
    expect(s().step).toBe("strength");
  });

  it("only shows a class for her own target, and forgets it when she edits the race", async () => {
    const { store } = setup();
    const s = () => store.getState();
    s().update({ race: 10000, date: "2027-04-11", hours: "0", minutes: "45" });
    await s().checkTarget();
    expect(s().verdict).toBe("ambitieux");
    s().update({ minutes: "75" });
    await s().checkTarget();
    expect(s().verdict).toBeUndefined();
    s().update({ hours: "1", minutes: "05" });
    await s().checkTarget();
    expect(s().verdict).toBe("atteignable");
    s().update({ race: 5000 });
    expect(s().verdict).toBeUndefined();
  });

  it("sends program, muscu, pain, then the profile, and starts the tour", async () => {
    const { api, calls, store } = setup();
    const s = () => store.getState();
    s().update({
      race: "other",
      otherKm: "21,1",
      date: "2027-04-11",
      hours: "2",
      minutes: "",
      runsPerWeek: 4,
      bedtime: "23:30",
      earliest: "7:00",
      noRunDays: [7, 3],
      strength: [{ id: "a", name: " Jambes ", legs: true, day: 3, start: "18:00" }],
      pain: true,
      zone: "Genou",
      level: 3,
    });
    expect(await s().submit()).toBe(true);
    expect(calls).toEqual(["saveProgram", "addEvent", "reportPain", "saveProfile"]);
    expect(api.saveProgram).toHaveBeenCalledWith({ goal: { distanceM: 21097.5, date: "2027-04-11", targetMin: 120 } });
    expect(api.addEvent).toHaveBeenCalledWith({
      kind: "strength",
      title: "Jambes",
      start: "2026-11-18T18:00",
      end: "2026-11-18T19:00",
      legs: true,
      recurrence: "weekly",
    });
    expect(api.reportPain).toHaveBeenCalledWith({ reason: "pain", where: "genou", walking0to10: 3 });
    expect(api.saveProfile).toHaveBeenCalledWith(
      expect.objectContaining({ runsPerWeek: 4, earliest: "07:00", bedtime: "23:30", noRunDays: [3, 7] }),
    );
    expect(s().phase).toBe("tour");
  });

  it("resumes a failed send without repeating what went through", async () => {
    let fail = true;
    const { calls, store, storage } = setup({
      saveProfile: async () => {
        if (fail) throw new Error("offline");
      },
    });
    const s = () => store.getState();
    s().update({ race: "none", strength: [{ id: "a", name: "Haut", legs: false, day: 1, start: "12:00" }] });
    expect(await s().submit()).toBe(false);
    expect(s().error).toBeDefined();
    fail = false;
    expect(await s().submit()).toBe(true);
    expect(calls).toEqual(["saveProgram", "addEvent", "saveProfile", "saveProfile"]);
    s().endTour();
    expect(s().phase).toBe("hidden");
    expect(storage.setItem).toHaveBeenCalledWith(DONE_KEY, "done");
  });
});

describe("onboarding payload", () => {
  it("sends maintenance mode without a goal, and strength late at night ends at midnight", () => {
    const payload = toPayload(
      { ...EMPTY, race: "none", strength: [{ id: "a", name: "Soir", legs: false, day: 7, start: "23:30" }] },
      TODAY,
    );
    expect(payload.program).toEqual({ goal: null });
    expect(payload.events[0]?.start).toBe("2026-11-22T23:30");
    expect(payload.events[0]?.end).toBe("2026-11-22T23:59");
    expect(payload.pain).toBeUndefined();
  });

  it("starts muscu today when today is its day", () => {
    expect(firstDay(TODAY, 1)).toBe(TODAY);
    expect(firstDay(TODAY, 7)).toBe("2026-11-22");
  });

  it("writes French copy without long dashes or exclamation marks", () => {
    for (const step of STEPS) expect(`${COPY[step].title} ${COPY[step].lead}`).not.toMatch(/[—–!]/);
  });
});
