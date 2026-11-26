import {
  changeOptionsSchema,
  changeResponseSchema,
  chatHistorySchema,
  chatStreamEventSchema,
} from "@annarrive/protocol";
import { describe, expect, it } from "vitest";
import { REGGIE_BUSY, ReggieBusyError, type ReggieRun, ReggieUnavailableError } from "../src/reggie/agent.ts";
import { ChatService, cleanAnswer } from "../src/services/chat.ts";
import { MONDAY_8AM, session, setup } from "./helpers.ts";

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
    expect(prompts[0]).toContain("Nous sommes lundi 8:00, le 2026-11-16");

    const history = chatHistorySchema.parse(await (await t.request("GET", "/api/chat")).json());
    expect(history.messages.map((m) => [m.role, m.text])).toEqual([
      ["anna", "Je peux décaler ce soir ?"],
      ["reggie", "Mercredi 18:00 marche."],
    ]);
    expect(history.messages[0]?.context).toEqual({ screen: "today", sessionId: "tonight" });

    await (await t.request("POST", "/api/chat", { text: "Et jeudi ?" })).text();
    expect(prompts[1]).toContain("Anna : Je peux décaler ce soir ?\nReggie : Mercredi 18:00 marche.");
  });

  it("streams the answer as it comes, and takes back a long text that turned out to precede a tool", async () => {
    const long = "Je regarde ta semaine, tes cours, ta muscu et tes créneaux libres pour trouver le meilleur moment.";
    const reggie: ReggieRun = async function* () {
      yield { type: "text", delta: `${long} Encore` };
      yield { type: "tool_call", name: "get_week", input: {} };
      yield { type: "text", delta: "\n\n" };
      yield { type: "text", delta: "Jeudi" };
      yield { type: "text", delta: " 18 h." };
    };
    const t = await ready(reggie);
    const events = parseSse(await (await t.request("POST", "/api/chat", { text: "Quand ?" })).text());
    expect(events.slice(1, -1)).toEqual([
      { type: "text", delta: `${long} Encore` },
      { type: "retract" },
      { type: "text", delta: "Jeudi" },
      { type: "text", delta: " 18 h." },
    ]);
    expect(events.at(-1)).toMatchObject({ type: "done", message: { text: "Jeudi 18 h." } });
  });

  it("keeps the words written before a question's buttons", async () => {
    const reggie: ReggieRun = async function* () {
      yield { type: "text", delta: "Je garde mes règles." };
      yield { type: "tool_call", name: "ask_choice", input: { options: ["Oui", "Non"] } };
      yield { type: "text", delta: "\n\n" };
      yield { type: "text", delta: "Tu veux en parler ?" };
    };
    const t = await ready(reggie);
    const events = parseSse(await (await t.request("POST", "/api/chat", { text: "Ajoute 3 h" })).text());
    expect(events.at(-1)).toMatchObject({
      type: "done",
      message: { text: "Je garde mes règles.\n\nTu veux en parler\u202f?" },
    });
    expect(events.some((e) => e.type === "retract")).toBe(false);
  });

  it("stores a question written before its buttons and again after them once", async () => {
    // Eval « mieux-ambigu »: the words before ask_choice stay, and the model wrote the same question after it.
    const reggie: ReggieRun = async function* () {
      yield { type: "text", delta: "Tant mieux. Tu te sens guérie ?" };
      yield { type: "tool_call", name: "ask_choice", input: { options: ["Oui", "Non"] } };
      yield { type: "text", delta: "\n\n" };
      yield { type: "text", delta: "Tu te sens guérie ?" };
    };
    const t = await ready(reggie);
    const events = parseSse(await (await t.request("POST", "/api/chat", { text: "Ça va mieux" })).text());
    expect(events.at(-1)).toMatchObject({ type: "done", message: { text: "Tant mieux. Tu te sens guérie\u202f?" } });
  });

  it("drops the search tool's English source list when Reggie already gave his link", () => {
    // Eval « nutrition-source ».
    const reply =
      "Des pâtes la veille. Source : https://www.nhs.uk/live-well/exercise/running?x=1\n\nSources:\n- [Food for runners](https://www.nhs.uk/a)\n- [B](https://www.nhs.uk/b)";
    expect(cleanAnswer(reply)).toBe(
      "Des pâtes la veille. Source\u202f: https://www.nhs.uk/live-well/exercise/running?x=1",
    );
    // Without his own link, the list is the only source: it stays.
    expect(cleanAnswer("Des pâtes.\n\nSources:\n- [A](https://www.nhs.uk/a)")).toBe(
      "Des pâtes.\n\nSources\u202f:\n- [A](https://www.nhs.uk/a)",
    );
  });

  it("ends with an error event, stores nothing and journals an incident when Reggie fails", async () => {
    const failing: ReggieRun = async function* () {
      yield { type: "text", delta: "Je" };
      throw new Error("network");
    };
    const t = await ready(failing);
    for (let i = 0; i < 3; i++) {
      const events = parseSse(await (await t.request("POST", "/api/chat", { text: "Salut" })).text());
      expect(events.at(-1)).toEqual({ type: "error", error: REGGIE_BUSY });
    }
    // Tapped three times, sent three times: nothing to show twice in her history.
    expect(t.stores.chatMessage.list()).toEqual([]);
    expect(t.services.incidents.list(new Date(0)).map((i) => i.message)).toEqual([
      "Error: network",
      "Error: network",
      "Error: network",
    ]);
  });

  it("says Reggie cannot answer for now, with Réessayer, when every account is at its limit", async () => {
    // biome-ignore lint/correctness/useYield: the run fails before its first event.
    const limited: ReggieRun = async function* () {
      throw new ReggieBusyError();
    };
    const t = await ready(limited);
    const events = parseSse(await (await t.request("POST", "/api/chat", { text: "?" })).text());
    expect(events.at(-1)).toEqual({ type: "error", error: REGGIE_BUSY });
  });

  it("takes a reply with nothing to show for a failure, never an empty bubble", async () => {
    // biome-ignore lint/correctness/useYield: an account at its limit used to end like this.
    const empty: ReggieRun = async function* () {};
    const t = await ready(empty);
    const events = parseSse(await (await t.request("POST", "/api/chat", { text: "?" })).text());
    expect(events.map((e) => e.type)).toEqual(["typing", "error"]);
    expect(t.stores.chatMessage.list()).toEqual([]);
  });

  it("gives up on a reply that stays silent", async () => {
    const stuck: ReggieRun = async function* () {
      yield { type: "text", delta: "Je" };
      await new Promise(() => undefined);
    };
    const t = await ready(stuck);
    const chat = new ChatService(
      t.stores,
      t.services.plan,
      t.services.fitness,
      stuck,
      () => MONDAY_8AM,
      t.services.incidents,
      10,
    );
    const events = [];
    for await (const event of chat.send({ text: "Salut" })) events.push(event);
    expect(events.at(-1)).toEqual({ type: "error", error: REGGIE_BUSY });
  });

  it("keeps her message when a tool already ran before the failure", async () => {
    const midway: ReggieRun = async function* () {
      yield { type: "tool_call", name: "move_session", input: {} };
      throw new Error("network");
    };
    const t = await ready(midway);
    await (await t.request("POST", "/api/chat", { text: "Décale ce soir" })).text();
    expect(t.stores.chatMessage.list().map((m) => [m.role, m.text])).toEqual([["anna", "Décale ce soir"]]);
  });

  it("says when Reggie has no credentials", async () => {
    // biome-ignore lint/correctness/useYield: the run fails before its first event.
    const unconfigured: ReggieRun = async function* () {
      throw new ReggieUnavailableError();
    };
    const t = await ready(unconfigured);
    const events = parseSse(await (await t.request("POST", "/api/chat", { text: "Salut" })).text());
    expect(events.at(-1)).toEqual({
      type: "error",
      error: "Reggie ne répond pas pour l'instant. Déplacer, Changer et Pas dispo marchent toujours.",
      retry: false,
    });
  });

  it("rejects an empty message or a missing body", async () => {
    const t = await ready(scripted([]));
    expect((await t.request("POST", "/api/chat", { text: "  " })).status).toBe(400);
    expect((await t.request("POST", "/api/chat")).status).toBe(400);
  });
});

describe("GET /api/chat", () => {
  it("gives one Paris day at a time, today first, with the day to load next", async () => {
    const t = await ready(scripted([]));
    const say = (at: string, text: string) => t.stores.chatMessage.put({ id: at, at, role: "anna", text, widgets: [] });
    say("2026-11-13T10:00:00.000Z", "vendredi");
    say("2026-11-15T22:30:00.000Z", "dimanche 23:30");
    say("2026-11-15T23:30:00.000Z", "lundi 0:30");
    say("2026-11-16T06:30:00.000Z", "lundi 7:30");
    const day = async (query = "") =>
      chatHistorySchema.parse(await (await t.request("GET", `/api/chat${query}`)).json());

    const today = await day();
    expect(today).toMatchObject({ day: "2026-11-16", earlier: "2026-11-15" });
    expect(today.messages.map((m) => m.text)).toEqual(["lundi 0:30", "lundi 7:30"]);
    const sunday = await day("?day=2026-11-15");
    expect(sunday).toMatchObject({ earlier: "2026-11-13" });
    expect(sunday.messages.map((m) => m.text)).toEqual(["dimanche 23:30"]);
    const friday = await day("?day=2026-11-13");
    expect(friday.messages.map((m) => m.text)).toEqual(["vendredi"]);
    expect(friday.earlier).toBeUndefined();
    expect((await t.request("GET", "/api/chat?day=hier")).status).toBe(400);
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
    expect(changeResponseSchema.parse(await sick.json()).change?.summary).toBe(
      "Malade : footing tranquille jusqu'à ce que ça aille mieux",
    );
    expect((await t.request("POST", "/api/unavailable", { reason: "pain", where: "dos" })).status).toBe(400);

    const better = changeResponseSchema.parse(await (await t.request("POST", "/api/feel-better")).json());
    expect(better.change?.summary).toBe("Ça va mieux : 3 jours sans fractionné, puis tes séances reprennent");
  });
});
