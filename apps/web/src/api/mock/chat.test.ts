import { describe, expect, it } from "vitest";
import type { ChatEvent } from "../schemas.ts";
import { createMockApi } from "./index.ts";

const MONDAY = "2026-11-16";

async function say(api: ReturnType<typeof createMockApi>, text: string) {
  const events: ChatEvent[] = [];
  for await (const event of api.chat({ text })) events.push(event);
  return events.flatMap((e) => (e.type === "message" ? [e.message] : []));
}

describe("scripted Reggie", () => {
  it("walks the pain flow: zone, 0 to 10, then a session he can take", async () => {
    const api = createMockApi({ monday: MONDAY });
    expect((await say(api, "J'ai mal au mollet"))[0]?.widget?.type).toBe("choices");
    expect((await say(api, "Mollet"))[0]?.widget?.type).toBe("scale");
    const advice = await say(api, "6 sur 10");
    expect(advice[0]?.text).toContain("kiné");
    expect(advice[1]?.widget).toMatchObject({ type: "preview", session: { title: "Footing tranquille · 20 min" } });
    const done = await say(api, "Prendre celle-ci");
    expect(done[0]?.widget?.type).toBe("change");
    expect((await api.today()).session?.durationMin).toBe(20);
  });

  it("walks the sickness flow without blocking", async () => {
    const api = createMockApi({ monday: MONDAY });
    await say(api, "Je suis malade");
    const answer = await say(api, "Oui");
    expect(answer[0]?.text).toMatch(/^Je te conseille le repos/);
    expect((await api.today()).session?.title).toBe("Footing tranquille");
  });

  it("proposes slots and moves on the one she taps", async () => {
    const api = createMockApi({ monday: MONDAY });
    const [slots] = await say(api, "Décaler à demain");
    if (slots?.widget?.type !== "slots") throw new Error("slots expected");
    expect(slots.widget.slots.length).toBeGreaterThan(0);
    const [moved] = await say(api, "Demain 18:00");
    expect(moved?.widget?.type).toBe("change");
  });

  it("shortens on request, or keeps the plan", async () => {
    const api = createMockApi({ monday: MONDAY });
    const [, preview] = await say(api, "Plus court");
    expect(preview?.widget).toMatchObject({ type: "preview", optionId: "shorter" });
    expect((await say(api, "Plutôt du repos"))[0]?.widget?.type).toBe("change");
  });

  it("searches trusted sources for health questions, with the link", async () => {
    const api = createMockApi({ monday: MONDAY });
    const events: ChatEvent[] = [];
    for await (const event of api.chat({ text: "J'ai mal au tibia, c'est grave ?" })) events.push(event);
    expect(events).toContainEqual({ type: "status", status: "searching" });
    const message = events.at(-1);
    expect(message?.type === "message" && message.message.source?.url).toMatch(/^https:\/\/www\.nhs\.uk/);
    const [food] = await say(api, "Je mange quoi avant un semi ?");
    expect(food?.source?.url).toContain("mayoclinic.org");
  });

  it("explains, welcomes good news and answers anything else", async () => {
    const api = createMockApi({ monday: MONDAY });
    expect((await say(api, "Pourquoi cette allure ?"))[0]?.text).toContain("5:07");
    expect((await say(api, "Ça va mieux"))[0]?.text).toContain("3 jours");
    expect((await say(api, "Bonjour"))[0]?.text).toMatch(/^Je note/);
  });

  it("has nothing to adapt on a rest day", async () => {
    const api = createMockApi({ monday: MONDAY, scenario: "rest" });
    await say(api, "Douleur");
    await say(api, "Genou");
    expect((await say(api, "2 sur 10"))[0]?.text).toMatch(/^Pas de course aujourd'hui/);
  });
});
