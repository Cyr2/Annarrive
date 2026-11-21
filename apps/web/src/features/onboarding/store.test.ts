import { describe, expect, it, vi } from "vitest";
import { createMockOnboardingApi, type OnboardingApi } from "../../api/onboarding.ts";
import { DONE_KEY } from "./done.ts";
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
    linkTimetable: spy("linkTimetable", base.linkTimetable),
    saveProgram: spy("saveProgram", base.saveProgram),
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
    expect(todo.storage.setItem).not.toHaveBeenCalled();
    const done = setup({}, "");
    await done.store.getState().start();
    expect(done.store.getState().phase).toBe("hidden");
    expect(done.storage.setItem).toHaveBeenCalledWith(DONE_KEY, "done");
  });

  it("never blocks the app when the server does not answer, and asks again next time", async () => {
    const { store, storage } = setup({ done: () => Promise.reject(new Error("offline")) });
    await store.getState().start();
    expect(store.getState().phase).toBe("hidden");
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("asks for the race before going on, then one question per screen, and back the same way", () => {
    const { store } = setup();
    const s = () => store.getState();
    s().next();
    expect(s().step).toBe("race");
    s().next();
    expect(s().step).toBe("race");
    s().update({ race: 10000, date: "2026-11-10" });
    s().next();
    expect(s().step).toBe("race");
    s().update({ date: "2027-03-14" });
    s().next();
    expect(s().step).toBe("last");
    s().back();
    expect(s().step).toBe("race");
    expect(s().direction).toBe(-1);
  });

  it("« Je n'en ai pas » drops the time she typed and goes on", () => {
    const { store } = setup();
    const s = () => store.getState();
    store.setState({ step: "last" });
    s().update({ lastSec: 5 * 60 });
    s().skipLast();
    expect(s().step).toBe("week");
    expect(s().draft.lastSec).toBe(0);
  });

  it("judges her own target, and forgets the verdict when she edits the race", async () => {
    const { store } = setup();
    const s = () => store.getState();
    s().update({ race: 10000, date: "2027-04-11", targetSec: 45 * 60 });
    await s().checkTarget();
    expect(s().verdict).toBe("ambitieux");
    s().update({ targetSec: 0 });
    await s().checkTarget();
    expect(s().verdict).toBeUndefined();
    s().update({ targetSec: 65 * 60 + 30 });
    await s().checkTarget();
    expect(s().verdict).toBe("atteignable");
    s().update({ race: 5000 });
    expect(s().verdict).toBeUndefined();
  });

  it("says null when the server cannot judge, and false when it cannot reach the watch", async () => {
    const { store } = setup({
      feasibility: () => Promise.reject(new Error("offline")),
      watchLinked: () => Promise.reject(new Error("offline")),
    });
    const s = () => store.getState();
    s().update({ race: 10000, date: "2027-04-11", targetSec: 45 * 60 });
    await s().checkTarget();
    expect(s().verdict).toBeNull();
    await s().checkWatch();
    expect(s().watch).toBe(false);
  });

  it("sends the timetable link, the program, then the profile, and shows her week", async () => {
    const { api, calls, store } = setup();
    const s = () => store.getState();
    store.setState({ step: "consent" });
    s().update({
      race: "other",
      otherKm: "21,1",
      date: "2027-04-11",
      targetSec: 2 * 3600,
      runsPerWeek: 4,
      bedtime: "23:30",
      travelMin: 45,
      icsUrl: " https://edt.univ.fr/anna.ics ",
    });
    expect(await s().submit()).toBe(true);
    // The classes are read first so they shape the first week (audit onboarding 1).
    expect(calls).toEqual(["linkTimetable", "saveProgram", "saveProfile"]);
    expect(api.linkTimetable).toHaveBeenCalledWith("https://edt.univ.fr/anna.ics");
    expect(api.saveProgram).toHaveBeenCalledWith({
      goal: { distanceM: 21097.5, date: "2027-04-11", targetMin: 120 },
    });
    expect(api.saveProfile).toHaveBeenCalledWith(
      expect.objectContaining({ runsPerWeek: 4, bedtime: "23:30", travelMin: 45 }),
    );
    expect(s().step).toBe("ready");
    // Her week is built: no going back to the questions.
    s().back();
    expect(s().step).toBe("ready");
  });

  it("resumes a failed send without repeating what went through, then ends on « Voir aujourd'hui »", async () => {
    let fail = true;
    const { calls, store, storage } = setup({
      saveProfile: async () => {
        if (fail) throw new Error("offline");
      },
    });
    const s = () => store.getState();
    store.setState({ step: "consent" });
    s().update({ race: "none" });
    expect(await s().submit()).toBe(false);
    expect(s().error).toBeDefined();
    expect(s().step).toBe("consent");
    fail = false;
    expect(await s().submit()).toBe(true);
    expect(calls).toEqual(["saveProgram", "saveProfile", "saveProfile"]);
    s().finish();
    expect(s().phase).toBe("hidden");
    expect(storage.setItem).toHaveBeenCalledWith(DONE_KEY, "done");
  });
});
