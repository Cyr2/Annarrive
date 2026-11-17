import type { HookInput } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it, vi } from "vitest";
import {
  createReggie,
  eventsOf,
  type QueryFn,
  type ReggieEvent,
  reggieOptions,
  sdkEnv,
  webGuard,
} from "../src/reggie/agent.ts";
import { SOURCE_DOMAINS } from "../src/reggie/prompt.ts";
import { reggieTools } from "../src/reggie/tools.ts";
import { setup } from "./helpers.ts";

const env = { ANTHROPIC_API_KEY: "test-key", CLAUDE_CODE_OAUTH_TOKEN: "", PATH: "/bin" };
const tools = () => reggieTools(setup().services.plan, []);

function preToolUse(tool_name: string, tool_input: unknown): HookInput {
  return {
    hook_event_name: "PreToolUse",
    tool_name,
    tool_input,
    tool_use_id: "t1",
    session_id: "s",
    transcript_path: "",
    cwd: "",
  } as HookInput;
}

const signal = new AbortController().signal;

/** A recorded SDK stream: text before a tool call, a web search, then the answer. */
const recorded: unknown[] = [
  { type: "system", subtype: "init" },
  {
    type: "stream_event",
    parent_tool_use_id: null,
    event: { type: "content_block_start", content_block: { type: "text" } },
  },
  {
    type: "stream_event",
    parent_tool_use_id: null,
    event: { type: "content_block_delta", delta: { type: "text_delta", text: "Je regarde." } },
  },
  {
    type: "stream_event",
    parent_tool_use_id: null,
    event: { type: "content_block_start", content_block: { type: "tool_use", name: "WebSearch" } },
  },
  {
    type: "assistant",
    parent_tool_use_id: null,
    message: { content: [{ type: "tool_use", name: "WebSearch", input: { query: "q" } }] },
  },
  {
    type: "assistant",
    parent_tool_use_id: null,
    message: {
      content: [
        { type: "tool_use", name: "mcp__annarrive__get_today", input: {} },
        { type: "text", text: "x" },
      ],
    },
  },
  {
    type: "stream_event",
    parent_tool_use_id: "sub",
    event: { type: "content_block_delta", delta: { type: "text_delta", text: "ignoré" } },
  },
  {
    type: "stream_event",
    parent_tool_use_id: null,
    event: { type: "content_block_start", content_block: { type: "text" } },
  },
  {
    type: "stream_event",
    parent_tool_use_id: null,
    event: { type: "content_block_delta", delta: { type: "text_delta", text: "Repos ce soir." } },
  },
  { type: "result", subtype: "success", result: "Repos ce soir." },
];

function fakeQuery(messages: unknown[], seen: unknown[] = []): QueryFn {
  return ((params: unknown) => {
    seen.push(params);
    return (async function* () {
      yield* messages;
    })();
  }) as unknown as QueryFn;
}

async function collect(run: AsyncIterable<ReggieEvent>) {
  const events: ReggieEvent[] = [];
  for await (const e of run) events.push(e);
  return events;
}

describe("Reggie's SDK options", () => {
  it("allows only the app's tools and the guarded web tools, with no settings from disk", () => {
    const options = reggieOptions(tools(), env);
    expect(options).toMatchObject({
      model: "sonnet",
      effort: "medium",
      maxTurns: 8,
      tools: ["WebSearch", "WebFetch"],
      permissionMode: "dontAsk",
      settingSources: [],
      strictMcpConfig: true,
      persistSession: false,
      includePartialMessages: true,
    });
    expect(options.disallowedTools).toEqual(expect.arrayContaining(["Bash", "Read", "Write", "Edit"]));
    expect(options.allowedTools).toContain("mcp__annarrive__move_session");
    expect(options.allowedTools?.filter((t) => !t.startsWith("mcp__annarrive__"))).toEqual(["WebSearch", "WebFetch"]);
    expect(Object.keys(options.mcpServers ?? {})).toEqual(["annarrive"]);
    expect(options.hooks?.PreToolUse?.[0]?.matcher).toBe("WebSearch|WebFetch");
  });

  it("takes the model from REGGIE_MODEL and rejects anything but sonnet or opus", () => {
    expect(reggieOptions(tools(), { ...env, REGGIE_MODEL: "opus" }).model).toBe("opus");
    expect(reggieOptions(tools(), { ...env, REGGIE_MODEL: "" }).model).toBe("sonnet");
    expect(() => reggieOptions(tools(), { ...env, REGGIE_MODEL: "gpt" })).toThrow();
  });

  it("drops empty variables and needs one credential", () => {
    expect(sdkEnv(env)).toEqual({ ANTHROPIC_API_KEY: "test-key", PATH: "/bin" });
    expect(sdkEnv({ CLAUDE_CODE_OAUTH_TOKEN: "tok" })).toEqual({ CLAUDE_CODE_OAUTH_TOKEN: "tok" });
    const secrets = { SESSION_SECRET: "s", BRIDGE_SECRET: "b", GARMIN_PASSWORD: "p", VAPID_PRIVATE_KEY: "v" };
    expect(sdkEnv({ ANTHROPIC_API_KEY: "k", ...secrets })).toEqual({ ANTHROPIC_API_KEY: "k" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => sdkEnv({ ANTHROPIC_API_KEY: "" })).toThrow("Reggie ne répond pas pour l'instant");
  });
});

describe("web guard", () => {
  it("pins searches to the allowed domains and stops after two", async () => {
    const guard = webGuard();
    const first = await guard(preToolUse("WebSearch", { query: "nutrition semi" }), "t1", { signal });
    expect(first).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: { query: "nutrition semi", allowed_domains: SOURCE_DOMAINS },
      },
    });
    await guard(preToolUse("WebSearch", { query: "b" }), "t2", { signal });
    const third = await guard(preToolUse("WebSearch", { query: "c" }), "t3", { signal });
    expect(third).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
  });

  it("fetches only pages of the allowed domains and their subdomains", async () => {
    const guard = webGuard();
    const ok = await guard(preToolUse("WebFetch", { url: "https://www.nhs.uk/conditions/shin-splints/" }), "t", {
      signal,
    });
    expect(ok).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } });
    for (const url of ["https://evilnhs.uk/x", "https://nhs.uk.evil.com/", "pas une url"]) {
      const denied = await webGuard()(preToolUse("WebFetch", { url }), "t", { signal });
      expect(denied).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
    }
  });

  it("ignores other hook events", async () => {
    const input = { hook_event_name: "Stop", session_id: "s", transcript_path: "", cwd: "" } as HookInput;
    expect(await webGuard()(input, undefined, { signal })).toEqual({});
  });
});

describe("Reggie's stream", () => {
  it("maps SDK messages to text, checking and tool calls, separating text blocks", async () => {
    const seen: unknown[] = [];
    const events = await collect(createReggie(fakeQuery(recorded, seen), env)({ prompt: "Salut", tools: tools() }));
    expect(events).toEqual([
      { type: "text", delta: "Je regarde." },
      { type: "checking" },
      { type: "tool_call", name: "WebSearch", input: { query: "q" } },
      { type: "tool_call", name: "get_today", input: {} },
      { type: "text", delta: "\n\n" },
      { type: "text", delta: "Repos ce soir." },
    ]);
    expect(seen[0]).toMatchObject({ prompt: "Salut", options: { permissionMode: "dontAsk" } });
  });

  it("fails on an error result, such as too many turns", async () => {
    const run = createReggie(fakeQuery([{ type: "result", subtype: "error_max_turns" }]), env);
    await expect(collect(run({ prompt: "x", tools: tools() }))).rejects.toThrow("error_max_turns");
  });

  it("ignores messages it does not know", () => {
    expect(eventsOf({ type: "rate_limit_event" })).toEqual([]);
    expect(eventsOf(null)).toEqual([]);
    expect(eventsOf({ type: "stream_event", parent_tool_use_id: null, event: { type: "message_stop" } })).toEqual([]);
  });
});
