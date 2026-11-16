import { readFileSync } from "node:fs";
import { pushKeySchema } from "@talaria/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PushMessage, PushSender } from "../src/services/notifications.ts";
import { session, setup } from "./helpers.ts";

const subscription = { endpoint: "https://push.test/anna", keys: { p256dh: "p256", auth: "secret" } };
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

function pushSetup(send: PushSender = vi.fn(async () => undefined), ics?: () => Promise<string>) {
  const t = setup({ push: { send, publicKey: "public-key" }, ...(ics ? { ics } : {}) });
  return { ...t, send };
}

/** Every message the fake push service received. */
function messages(send: PushSender): PushMessage[] {
  return vi.mocked(send).mock.calls.map(([, payload]) => JSON.parse(payload));
}

afterEach(() => vi.restoreAllMocks());

describe("push subscription routes", () => {
  it("gives the public key, stores a subscription and removes it", async () => {
    const t = pushSetup();
    await t.login();

    expect(pushKeySchema.parse((await t.call("GET", "/api/push/key")).json)).toEqual({ publicKey: "public-key" });
    expect((await t.call("POST", "/api/push/subscriptions", { ...subscription, expirationTime: null })).status).toBe(
      204,
    );
    expect(t.stores.pushSubscription.list()).toEqual([{ id: subscription.endpoint, keys: subscription.keys }]);
    expect((await t.call("DELETE", "/api/push/subscriptions", { endpoint: subscription.endpoint })).status).toBe(204);
    expect(t.stores.pushSubscription.list()).toEqual([]);
  });

  it("refuses a subscription that is not https, and gives no key when VAPID is not configured", async () => {
    const t = setup();
    await t.login();
    expect(
      (await t.call("POST", "/api/push/subscriptions", { ...subscription, endpoint: "http://x.test" })).status,
    ).toBe(400);
    expect((await t.call("GET", "/api/push/key")).json).toEqual({ publicKey: null });
  });
});

describe("notifications", () => {
  it("tells Anna her week is ready when the Sunday job builds it", async () => {
    const t = pushSetup();
    t.services.notifications.subscribe(subscription);

    await t.services.plan.buildNextWeek();

    expect(t.send).toHaveBeenCalledWith(subscription, expect.any(String));
    expect(messages(t.send)).toEqual([
      { title: "Ta semaine est prête", body: "Tes courses sont placées, jette un œil.", url: "/semaine" },
    ]);
  });

  it("tells Anna when a timetable change moves a run, with its new time", async () => {
    let feed = fixture("timetable-v1.ics");
    const t = pushSetup(undefined, async () => feed);
    await t.services.timetable.refresh();
    t.stores.plannedSession.put(session("fri", "2026-11-20T08:30"));
    t.services.notifications.subscribe(subscription);
    feed = fixture("timetable-v2.ics");

    await t.services.timetable.refresh();

    expect(messages(t.send)).toEqual([
      { title: "Course déplacée", body: "Ta course de vendredi passe à 10:30.", url: "/" },
    ]);
  });

  it("does not notify a move Anna made herself", async () => {
    const t = pushSetup();
    t.services.notifications.subscribe(subscription);
    t.stores.plannedSession.put(session("q", "2026-11-19T18:00"));
    t.services.plan.moveSession("q", "2026-11-18T18:00");
    expect(t.send).not.toHaveBeenCalled();
  });

  it("drops subscriptions the push service says are gone, keeps the others on any other error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const send = vi.fn<PushSender>(async (sub) => {
      if (sub.endpoint.endsWith("gone")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
      if (sub.endpoint.endsWith("missing")) throw Object.assign(new Error("Not found"), { statusCode: 404 });
      throw new Error("réseau");
    });
    const t = pushSetup(send);
    for (const name of ["gone", "missing", "flaky"]) {
      t.services.notifications.subscribe({ ...subscription, endpoint: `https://push.test/${name}` });
    }

    await t.services.notifications.runSynced();

    expect(t.stores.pushSubscription.list().map((s) => s.id)).toEqual(["https://push.test/flaky"]);
    expect(console.error).toHaveBeenCalledWith("Notification non envoyée : statut inconnu");
  });

  it("sends nothing when VAPID is not configured", async () => {
    const t = setup();
    t.services.notifications.subscribe(subscription);
    await expect(t.services.notifications.weekReady()).resolves.toBeUndefined();
  });

  it("writes every message without long dash, en dash or exclamation mark", async () => {
    const t = pushSetup();
    t.services.notifications.subscribe(subscription);
    const run = session("q", "2026-11-19T18:00");
    await t.services.notifications.weekReady();
    await t.services.notifications.runMoved(run, { ...run, start: "2026-11-20T07:30" });
    await t.services.notifications.runSynced();

    const texts = messages(t.send).flatMap((m) => [m.title, m.body]);
    expect(texts).toHaveLength(6);
    for (const text of texts) expect(text).not.toMatch(/[—–!]/);
  });
});
