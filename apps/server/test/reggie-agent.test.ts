import type { HookInput } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_PAUSE_MS,
  createReggie,
  credentialsOf,
  eventsOf,
  type QueryFn,
  ReggieBusyError,
  type ReggieEvent,
  reggieOptions,
  type StartupFn,
  sdkEnv,
  webGuard,
} from "../src/reggie/agent.ts";
import { SOURCE_DOMAINS, SYSTEM_PROMPT } from "../src/reggie/prompt.ts";
import { reggieTools } from "../src/reggie/tools.ts";
import { setup } from "./helpers.ts";

const env = { ANTHROPIC_API_KEY: "test-key", CLAUDE_CODE_OAUTH_TOKEN: "", PATH: "/bin" };
const key = { name: "ANTHROPIC_API_KEY", value: "test-key" } as const;
const tools = () => {
  const { services } = setup();
  return reggieTools(services.plan, services.fitness, []);
};

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
    const options = reggieOptions(tools(), env, key);
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

  it("passes only the variables the model's process needs, never a secret or an unknown variable", () => {
    const passed = sdkEnv(
      {
        ANTHROPIC_API_KEY: "k",
        CLAUDE_CODE_OAUTH_TOKEN: "a,b",
        Path: "C:\bin",
        HOME: "/home/node",
        TZ: "Europe/Paris",
        NODE_ENV: "production",
        REGGIE_MODEL: "opus",
        DARIUS_BRIDGE_SECRET: "d",
        DARIUS_BRIDGE_URL: "https://bridge.test",
        BRIDGE_SECRET: "b",
        SESSION_SECRET: "s",
        SOMETHING_ADDED_LATER: "x",
      },
      { name: "CLAUDE_CODE_OAUTH_TOKEN", value: "b" },
    );
    expect(passed).toEqual({
      CLAUDE_CODE_OAUTH_TOKEN: "b",
      Path: "C:\bin",
      HOME: "/home/node",
      TZ: "Europe/Paris",
      NODE_ENV: "production",
      REGGIE_MODEL: "opus",
    });
  });

  it("tells Reggie that class titles and places are data", () => {
    expect(SYSTEM_PROMPT).toMatch(/titres et les lieux des cours/);
  });

  it("takes the model from REGGIE_MODEL and rejects anything but sonnet or opus", () => {
    expect(reggieOptions(tools(), { ...env, REGGIE_MODEL: "opus" }, key).model).toBe("opus");
    expect(reggieOptions(tools(), { ...env, REGGIE_MODEL: "" }, key).model).toBe("sonnet");
    expect(() => reggieOptions(tools(), { ...env, REGGIE_MODEL: "gpt" }, key)).toThrow();
  });

  it("drops empty variables and needs one credential", () => {
    expect(sdkEnv(env, key)).toEqual({ ANTHROPIC_API_KEY: "test-key", PATH: "/bin" });
    const secrets = { SESSION_SECRET: "s", BRIDGE_SECRET: "b", GARMIN_PASSWORD: "p", VAPID_PRIVATE_KEY: "v" };
    expect(sdkEnv(secrets, key)).toEqual({ ANTHROPIC_API_KEY: "test-key" });
    expect(sdkEnv({ REGGIE_LOCAL_LOGIN: "1" })).toEqual({ REGGIE_LOCAL_LOGIN: "1" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => sdkEnv(env)).toThrow("Reggie ne répond pas pour l'instant");
  });

  it("lists the accounts in order: each comma-separated token, then the API key", () => {
    expect(credentialsOf({ CLAUDE_CODE_OAUTH_TOKEN: " a , ,b ", ANTHROPIC_API_KEY: "k" })).toEqual([
      { name: "CLAUDE_CODE_OAUTH_TOKEN", value: "a" },
      { name: "CLAUDE_CODE_OAUTH_TOKEN", value: "b" },
      { name: "ANTHROPIC_API_KEY", value: "k" },
    ]);
    expect(credentialsOf({ CLAUDE_CODE_OAUTH_TOKEN: "", ANTHROPIC_API_KEY: "" })).toEqual([]);
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

  it("starts the next turn's process after each turn and uses it for the same tools only", async () => {
    const answer = [{ type: "result", subtype: "success", result: "Ok." }];
    const coldPrompts: unknown[] = [];
    const warmPrompts: unknown[] = [];
    const closed = vi.fn();
    const startup = vi.fn(async () => ({
      query: (prompt: string) => {
        warmPrompts.push(prompt);
        return fakeQuery(answer)({ prompt });
      },
      close: closed,
    })) as unknown as StartupFn;
    const run = createReggie(fakeQuery(answer, coldPrompts), env, startup);
    const same = tools();
    await collect(run({ prompt: "un", tools: same }));
    await collect(run({ prompt: "deux", tools: same }));
    await collect(run({ prompt: "trois", tools: tools() }));
    expect(coldPrompts.map((p) => (p as { prompt: string }).prompt)).toEqual(["un", "trois"]);
    expect(warmPrompts).toEqual(["deux"]);
    expect(startup).toHaveBeenCalledTimes(3);
    await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
  });

  it("starts cold when the spare process failed to start", async () => {
    const seen: unknown[] = [];
    const startup = vi.fn(async () => Promise.reject(new Error("spawn"))) as unknown as StartupFn;
    const run = createReggie(fakeQuery([{ type: "result", subtype: "success" }], seen), env, startup);
    const same = tools();
    await collect(run({ prompt: "un", tools: same }));
    await collect(run({ prompt: "deux", tools: same }));
    expect(seen).toHaveLength(2);
  });

  it("fails on an error result, such as too many turns", async () => {
    const run = createReggie(fakeQuery([{ type: "result", subtype: "error_max_turns" }]), env);
    await expect(collect(run({ prompt: "x", tools: tools() }))).rejects.toThrow("error_max_turns");
  });

  it("fails when the turn ended on an API error", async () => {
    const run = createReggie(fakeQuery([{ type: "result", subtype: "success", is_error: true }]), env);
    await expect(collect(run({ prompt: "x", tools: tools() }))).rejects.toThrow("Reggie stopped: success");
  });

  it("ignores messages it does not know", () => {
    expect(eventsOf({ type: "rate_limit_event" })).toEqual([]);
    expect(eventsOf({ type: "rate_limit_event", rate_limit_info: { status: "allowed_warning" } })).toEqual([]);
    expect(eventsOf(null)).toEqual([]);
    expect(eventsOf({ type: "stream_event", parent_tool_use_id: null, event: { type: "message_stop" } })).toEqual([]);
  });
});

describe("backup accounts", () => {
  const accounts = { CLAUDE_CODE_OAUTH_TOKEN: "tok-a,tok-b", ANTHROPIC_API_KEY: "", PATH: "/bin" };
  const reset = 1_900_000_000;
  const limited: unknown[] = [
    { type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: reset } },
    { type: "assistant", parent_tool_use_id: null, error: "rate_limit", message: { content: [] } },
    { type: "result", subtype: "success", is_error: true, result: "You've hit your limit" },
  ];
  const answer: unknown[] = [
    {
      type: "stream_event",
      parent_tool_use_id: null,
      event: { type: "content_block_start", content_block: { type: "text" } },
    },
    {
      type: "stream_event",
      parent_tool_use_id: null,
      event: { type: "content_block_delta", delta: { type: "text_delta", text: "Ok." } },
    },
    { type: "result", subtype: "success" },
  ];

  /** Answers with `byToken[token]`, the token being the one the run's env carries; records each run's env. */
  function queryByToken(byToken: Record<string, unknown[]>, envs: Record<string, string>[]): QueryFn {
    return ((params: { options: { env: Record<string, string> } }) => {
      envs.push(params.options.env);
      return fakeQuery(byToken[params.options.env.CLAUDE_CODE_OAUTH_TOKEN ?? ""] ?? answer)(params as never);
    }) as unknown as QueryFn;
  }

  it("moves the question to the next account when one hits its limit, with one token per run", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const envs: Record<string, string>[] = [];
    const run = createReggie(queryByToken({ "tok-a": limited }, envs), accounts);
    expect(await collect(run({ prompt: "x", tools: tools() }))).toEqual([{ type: "text", delta: "Ok." }]);
    expect(envs.map((e) => e.CLAUDE_CODE_OAUTH_TOKEN)).toEqual(["tok-a", "tok-b"]);
    expect(envs.every((e) => !("ANTHROPIC_API_KEY" in e))).toBe(true);
  });

  it("lets a limited account rest until its reset, then tries it first again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const envs: Record<string, string>[] = [];
    let now = (reset - 60) * 1000;
    const run = createReggie(queryByToken({ "tok-a": limited }, envs), accounts, undefined, () => now);
    await collect(run({ prompt: "un", tools: tools() }));
    await collect(run({ prompt: "deux", tools: tools() }));
    now = reset * 1000 + 1;
    await collect(run({ prompt: "trois", tools: tools() })).catch(() => undefined);
    expect(envs.map((e) => e.CLAUDE_CODE_OAUTH_TOKEN)).toEqual(["tok-a", "tok-b", "tok-b", "tok-a", "tok-b"]);
  });

  it("rests an account without a reset time for the default pause, and ends on the API key", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const revoked = [
      { type: "assistant", parent_tool_use_id: null, error: "authentication_failed", message: { content: [] } },
      { type: "result", subtype: "success", is_error: true },
    ];
    const envs: Record<string, string>[] = [];
    let now = 0;
    const run = createReggie(
      queryByToken({ "tok-a": revoked, "tok-b": revoked }, envs),
      { ...accounts, ANTHROPIC_API_KEY: "k" },
      undefined,
      () => now,
    );
    expect(await collect(run({ prompt: "x", tools: tools() }))).toEqual([{ type: "text", delta: "Ok." }]);
    expect(envs.at(-1)).toMatchObject({ ANTHROPIC_API_KEY: "k" });
    expect(envs.at(-1)).not.toHaveProperty("CLAUDE_CODE_OAUTH_TOKEN");
    now = ACCOUNT_PAUSE_MS - 1;
    await collect(run({ prompt: "y", tools: tools() }));
    now = ACCOUNT_PAUSE_MS + 1;
    await collect(run({ prompt: "z", tools: tools() }));
    expect(envs.map((e) => e.CLAUDE_CODE_OAUTH_TOKEN ?? "key")).toEqual([
      "tok-a",
      "tok-b",
      "key",
      "key",
      "tok-a",
      "tok-b",
      "key",
    ]);
  });

  it("asks her to try again in a moment when every account is at its limit", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const run = createReggie(queryByToken({ "tok-a": limited, "tok-b": limited }, []), accounts);
    const failure = collect(run({ prompt: "x", tools: tools() }));
    await expect(failure).rejects.toBeInstanceOf(ReggieBusyError);
    await expect(failure).rejects.toThrow("Reggie ne peut pas répondre pour l'instant, réessaie dans un moment.");
  });

  it("takes a limit the SDK closes without an error result for a limit, not an empty answer", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const quiet = [limited[0], { type: "result", subtype: "success" }];
    const envs: Record<string, string>[] = [];
    const run = createReggie(queryByToken({ "tok-a": quiet }, envs), accounts);
    expect(await collect(run({ prompt: "x", tools: tools() }))).toEqual([{ type: "text", delta: "Ok." }]);
    expect(envs.map((e) => e.CLAUDE_CODE_OAUTH_TOKEN)).toEqual(["tok-a", "tok-b"]);
  });

  it("does not ask again once Reggie has said or done something, so no action runs twice", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const envs: Record<string, string>[] = [];
    const midway = [
      {
        type: "assistant",
        parent_tool_use_id: null,
        message: { content: [{ type: "tool_use", name: "mcp__annarrive__move_session", input: {} }] },
      },
      ...limited,
    ];
    const run = createReggie(queryByToken({ "tok-a": midway }, envs), accounts);
    await expect(collect(run({ prompt: "x", tools: tools() }))).rejects.toThrow();
    expect(envs).toHaveLength(1);
  });

  it("keeps the spare process for the account that answered only", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const started: string[] = [];
    const startup = vi.fn(async (params: { options: { env: Record<string, string> } }) => {
      started.push(params.options.env.CLAUDE_CODE_OAUTH_TOKEN ?? "");
      return { query: () => fakeQuery(answer)({ prompt: "" } as never), close: vi.fn() };
    }) as unknown as StartupFn;
    const run = createReggie(queryByToken({ "tok-a": limited }, []), accounts, startup);
    await collect(run({ prompt: "x", tools: tools() }));
    expect(started).toEqual(["tok-b"]);
  });
});
