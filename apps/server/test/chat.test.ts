import { changeOptionsSchema, changeResponseSchema, chatHistorySchema, chatStreamEventSchema } from "@talaria/protocol";
import { describe, expect, it } from "vitest";
import { type ReggieRun, ReggieUnavailableError } from "../src/reggie/agent.ts";
import { session, setup } from "./helpers.ts";

/** Plays a scripted turn: calls a tool through the real tool list, then writes. */
function scripted(prompts: string[]): ReggieRun {
  return async function* ({ prompt, tools }) {
    prompts.push(prompt);
    yield { type: "text", delta: "Je regarde tes créneaux." };
    const propose = tools.find((t) => t.name === "propose_move_slots");
    await propose?.handler({ sessionId: "tonight" } as never, {});
    yield { type: "checking" };
    yield { type: "tool_call", name: "propose_move_slots", input: { sessionId: "tonight" } };
    yield { type: "text", delta: " Mercredi 18:00 marche." };
  };
}

async function ready(reggie: ReggieRun) {
  const t = setup({ reggie });
  await t.login();
  t.stores.plannedSession.put(session("tonight", "2026-11-16T18:00"));
  return t;
}

/** Parses an SSE body into its events, checking the `event` name matches the payload type. */
function parseSse(body: string) {
  return body
    .split("\n\n")
    .filter((chunk) => chunk.trim() !== "")
    .map((chunk) => {
      const name = /^event: (.+)$/m.exec(chunk)?.[1];
      const data = /^data: (.+)$/m.exec(chunk)?.[1] ?? "";
      const event = chatStreamEventSchema.parse(JSON.parse(data));
      expect(event.type).toBe(name);
      return event;
    });
}

describe("POST /api/chat", () => {
  it("streams typing, then only the answer after the last tool call, then widgets, then the stored message", async () => {
    const prompts: string[] = [];
    const t = await ready(scripted(prompts));
    const response = await t.request("POST", "/api/chat", {
      text: "Je peux décaler ce soir ?",
      context: { screen: "today", sessionId: "tonight" },
    });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const events = parseSse(await response.text());

    expect(events.map((e) => e.type)).toEqual(["typing", "widget", "text", "widget", "done"]);
    const done = events.at(-1);
    if (done?.type !== "done") throw new Error("done expected");
    expect(done.message).toMatchObject({
      role: "reggie",
      text: "Mercredi 18:00 marche.",
      widgets: [{ type: "slots", sessionId: "tonight" }],
    });
    expect(prompts[0]).toContain(
      "Anna a ouvert la conversation depuis l'écran Aujourd'hui, à propos de la séance tonight.",
    );
    expect(prompts[0]).toContain("Nous sommes lundi 08:00, le 2026-11-16");

    const history = chatHistorySchema.parse(await (await t.request("GET", "/api/chat")).json());
    expect(history.messages.map((m) => [m.role, m.text])).toEqual([
      ["anna", "Je peux décaler ce soir ?"],
      ["reggie", "Mercredi 18:00 marche."],
    ]);
    expect(history.messages[0]?.context).toEqual({ screen: "today", sessionId: "tonight" });

    await (await t.request("POST", "/api/chat", { text: "Et jeudi ?" })).text();
    expect(prompts[1]).toContain("Anna : Je peux décaler ce soir ?\nReggie : Mercredi 18:00 marche.");
  });

  it("ends with an error event and keeps Anna's message when Reggie fails", async () => {
    const failing: ReggieRun = async function* () {
      yield { type: "text", delta: "Je" };
      throw new Error("network");
    };
    const t = await ready(failing);
    const events = parseSse(await (await t.request("POST", "/api/chat", { text: "Salut" })).text());
    expect(events.at(-1)).toEqual({ type: "error", error: "Reggie ne répond pas : réessaie dans un instant." });
    expect(t.stores.chatMessage.list().map((m) => m.role)).toEqual(["anna"]);
  });

  it("says when Reggie has no credentials", async () => {
    // biome-ignore lint/correctness/useYield: the run fails before its first event.
    const unconfigured: ReggieRun = async function* () {
      throw new ReggieUnavailableError();
    };
    const t = await ready(unconfigured);
    const events = parseSse(await (await t.request("POST", "/api/chat", { text: "Salut" })).text());
    expect(events.at(-1)).toMatchObject({ type: "error", error: expect.stringContaining("pas configuré") });
  });

  it("rejects an empty message or a missing body", async () => {
    const t = await ready(scripted([]));
    expect((await t.request("POST", "/api/chat", { text: "  " })).status).toBe(400);
    expect((await t.request("POST", "/api/chat")).status).toBe(400);
  });
});

describe("Changer, Pas dispo and Ça va mieux routes", () => {
  it("share the services Reggie uses", async () => {
    const t = await ready(scripted([]));
    const options = changeOptionsSchema.parse(await (await t.request("GET", "/api/sessions/tonight/options")).json());
    expect(options.jog30.durMin).toBe(30);

    const changed = changeResponseSchema.parse(
      await (await t.request("POST", "/api/sessions/tonight/change", { option: "easier" })).json(),
    );
    expect(changed.change?.summary).toBe("Séance passée en allure facile");

    const sick = await t.request("POST", "/api/unavailable", { reason: "sick", feverOrChest: false });
    expect(changeResponseSchema.parse(await sick.json()).change?.summary).toBe("Malade : séances adaptées");
    expect((await t.request("POST", "/api/unavailable", { reason: "pain", where: "dos" })).status).toBe(400);

    const better = changeResponseSchema.parse(await (await t.request("POST", "/api/feel-better")).json());
    expect(better.change?.summary).toBe("Retour progressif lancé");
  });
});
