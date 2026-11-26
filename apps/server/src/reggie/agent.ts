import {
  createSdkMcpServer,
  type HookCallback,
  type Options,
  type query as sdkQuery,
  type startup as sdkStartup,
  type WarmQuery,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { AppError } from "../errors.ts";
import { MAX_SEARCHES, SOURCE_DOMAINS, SYSTEM_PROMPT } from "./prompt.ts";
import { MCP_SERVER, type ReggieTool } from "./tools.ts";

/** What one Reggie turn emits; `tool_call` feeds the evaluation, the chat ignores it. */
export type ReggieEvent =
  | { type: "text"; delta: string }
  | { type: "checking" }
  | { type: "tool_call"; name: string; input: unknown };

export type ReggieRun = (input: { prompt: string; tools: ReggieTool[] }) => AsyncIterable<ReggieEvent>;
export type QueryFn = typeof sdkQuery;
export type StartupFn = typeof sdkStartup;

/** `sonnet` or `opus`; the alias follows the newest model of each family. */
export const reggieModelSchema = z.enum(["sonnet", "opus"]).default("sonnet");

const WEB_TOOLS = ["WebSearch", "WebFetch"];
const BUILTIN_DENIED = ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "NotebookEdit", "Task", "Agent"];

export class ReggieUnavailableError extends AppError {
  constructor() {
    super(503, "Reggie ne répond pas pour l'instant. Déplacer, Changer et Pas dispo marchent toujours.");
  }
}

export const REGGIE_BUSY = "Reggie ne peut pas répondre pour l'instant, réessaie dans un moment.";

/** Every account at its limit, or a reply that never came: the same message later can get its answer. */
export class ReggieBusyError extends AppError {
  constructor() {
    super(429, REGGIE_BUSY);
  }
}

const isAllowedHost = (url: string) => {
  const host = URL.parse(url)?.hostname ?? "";
  return SOURCE_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
};

const webInputSchema = z.object({ url: z.string().optional() }).loose();

/**
 * PreToolUse guard for the web tools: searches stay inside SOURCE_DOMAINS, fetches only reach them,
 * and each tool runs at most MAX_SEARCHES times per question.
 */
export function webGuard(): HookCallback {
  const counts = new Map<string, number>();
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const count = (counts.get(input.tool_name) ?? 0) + 1;
    counts.set(input.tool_name, count);
    const toolInput = webInputSchema.parse(input.tool_input);
    const deny = (reason: string) => ({
      hookSpecificOutput: {
        hookEventName: "PreToolUse" as const,
        permissionDecision: "deny" as const,
        permissionDecisionReason: reason,
      },
    });
    if (count > MAX_SEARCHES) return deny(`Limite de ${MAX_SEARCHES} recherches atteinte : réponds avec ce que tu as.`);
    if (input.tool_name === "WebFetch" && !isAllowedHost(toolInput.url ?? ""))
      return deny(`Seuls ces sites sont autorisés : ${SOURCE_DOMAINS.join(", ")}.`);
    const updatedInput =
      input.tool_name === "WebSearch" ? { ...toolInput, allowed_domains: SOURCE_DOMAINS } : toolInput;
    return {
      hookSpecificOutput: { hookEventName: "PreToolUse" as const, permissionDecision: "allow" as const, updatedInput },
    };
  };
}

/**
 * The model's process gets only what it runs on, never the server's secrets, whatever a fetched page asks it to do.
 * Names compared in capitals: Windows spells them Path or SystemRoot. The credential is added per account (`sdkEnv`).
 */
const ALLOWED_ENV = new Set([
  "PATH",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "TMPDIR",
  "TZ",
  "LANG",
]);
const ALLOWED_PREFIXES = ["NODE_", "LC_", "REGGIE_"];
const allowedEnv = (name: string) =>
  ALLOWED_ENV.has(name.toUpperCase()) || ALLOWED_PREFIXES.some((p) => name.toUpperCase().startsWith(p));

/** One account Reggie can run on: the variable the SDK reads and its value. */
export type Credential = { name: "CLAUDE_CODE_OAUTH_TOKEN" | "ANTHROPIC_API_KEY"; value: string };

/**
 * The accounts in the order they are tried: each token of CLAUDE_CODE_OAUTH_TOKEN (comma-separated), then
 * ANTHROPIC_API_KEY. The SDK would pick the API key over a token if it saw both, so each run gets exactly one.
 */
export function credentialsOf(env: NodeJS.ProcessEnv): Credential[] {
  const tokens = (env.CLAUDE_CODE_OAUTH_TOKEN ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((value): Credential => ({ name: "CLAUDE_CODE_OAUTH_TOKEN", value }));
  const key = env.ANTHROPIC_API_KEY?.trim();
  return key ? [...tokens, { name: "ANTHROPIC_API_KEY", value: key }] : tokens;
}

/**
 * The env of one run: the allowed variables, empty ones dropped (as in .env.example), plus that account's credential.
 * REGGIE_LOCAL_LOGIN=1 lets the eval runner use the developer machine's existing Claude Code login instead.
 */
export function sdkEnv(env: NodeJS.ProcessEnv, credential?: Credential): Record<string, string> {
  const set = Object.fromEntries(
    Object.entries(env).filter((e): e is [string, string] => Boolean(e[1]) && allowedEnv(e[0])),
  );
  if (credential) return { ...set, [credential.name]: credential.value };
  if (set.REGGIE_LOCAL_LOGIN !== "1") {
    // The detail is for whoever runs the server; Anna reads the error's own words.
    console.error("Reggie : aucune clé (CLAUDE_CODE_OAUTH_TOKEN ou ANTHROPIC_API_KEY) dans l'environnement");
    throw new ReggieUnavailableError();
  }
  return set;
}

export function reggieOptions(tools: ReggieTool[], env: NodeJS.ProcessEnv, credential?: Credential): Options {
  return {
    systemPrompt: SYSTEM_PROMPT,
    model: reggieModelSchema.parse(env.REGGIE_MODEL || undefined),
    // Short replies with a few tool calls: medium keeps latency low; the 20 scenarios decide whether to change it.
    effort: "medium",
    maxTurns: 8,
    tools: WEB_TOOLS,
    disallowedTools: BUILTIN_DENIED,
    allowedTools: [...tools.map((t) => `mcp__${MCP_SERVER}__${t.name}`), ...WEB_TOOLS],
    permissionMode: "dontAsk",
    settingSources: [],
    strictMcpConfig: true,
    persistSession: false,
    includePartialMessages: true,
    mcpServers: { [MCP_SERVER]: createSdkMcpServer({ name: MCP_SERVER, version: "1.0.0", tools }) },
    hooks: { PreToolUse: [{ matcher: WEB_TOOLS.join("|"), hooks: [webGuard()] }] },
    env: sdkEnv(env, credential),
  };
}

// The SDK types its messages with a package it does not ship, so they arrive untyped: validate what we read.
const streamEventSchema = z.object({
  type: z.literal("stream_event"),
  parent_tool_use_id: z.string().nullable(),
  event: z.object({
    type: z.string(),
    content_block: z.object({ type: z.string(), name: z.string().optional() }).optional(),
    delta: z.object({ type: z.string(), text: z.string().optional() }).optional(),
  }),
});
const assistantSchema = z.object({
  type: z.literal("assistant"),
  parent_tool_use_id: z.string().nullable(),
  message: z.object({
    content: z.array(z.object({ type: z.string(), name: z.string().optional(), input: z.unknown().optional() })),
  }),
});
const resultSchema = z.object({ type: z.literal("result"), subtype: z.string(), is_error: z.boolean().optional() });
const rateLimitSchema = z.object({
  type: z.literal("rate_limit_event"),
  rate_limit_info: z.object({ status: z.string(), resetsAt: z.number().optional() }),
});
const accountErrorSchema = z.object({
  type: z.literal("assistant"),
  error: z.enum(["rate_limit", "authentication_failed", "oauth_org_not_allowed", "account_on_hold", "billing_error"]),
});

/** `limit`: this account cannot answer now (usage limit, revoked token, billing); `resetsAt` in ms when known. */
type Internal =
  | ReggieEvent
  | { type: "text_block" }
  | { type: "limit"; resetsAt?: number }
  | { type: "failed"; reason: string };

function streamEvents({ event }: z.infer<typeof streamEventSchema>): Internal[] {
  if (event.type === "content_block_delta" && event.delta?.type === "text_delta")
    return [{ type: "text", delta: event.delta.text ?? "" }];
  if (event.type !== "content_block_start") return [];
  if (event.content_block?.type === "text") return [{ type: "text_block" }];
  return WEB_TOOLS.includes(event.content_block?.name ?? "") ? [{ type: "checking" }] : [];
}

/** Maps one SDK message to Reggie events; subagent frames are ignored. */
export function eventsOf(message: unknown): Internal[] {
  const stream = streamEventSchema.safeParse(message);
  if (stream.success) return stream.data.parent_tool_use_id === null ? streamEvents(stream.data) : [];
  if (accountErrorSchema.safeParse(message).success) return [{ type: "limit" }];
  const assistant = assistantSchema.safeParse(message);
  if (assistant.success && assistant.data.parent_tool_use_id === null) {
    return assistant.data.message.content
      .filter((b) => b.type === "tool_use")
      .map((b) => ({ type: "tool_call", name: (b.name ?? "").replace(`mcp__${MCP_SERVER}__`, ""), input: b.input }));
  }
  const limit = rateLimitSchema.safeParse(message);
  if (limit.success && limit.data.rate_limit_info.status === "rejected") {
    const resetsAt = limit.data.rate_limit_info.resetsAt;
    // In Unix seconds, like the API's rate-limit headers.
    return [resetsAt === undefined ? { type: "limit" } : { type: "limit", resetsAt: resetsAt * 1000 }];
  }
  const result = resultSchema.safeParse(message);
  if (result.success && (result.data.subtype !== "success" || result.data.is_error))
    return [{ type: "failed", reason: result.data.subtype }];
  return [];
}

/** The account in use hit its limit before Reggie said or did anything: the next account can take the question. */
class AccountLimitError extends Error {
  constructor(readonly resetsAt: number | undefined) {
    super("Reggie : compte à sa limite");
  }
}

/** How long an account rests when the SDK gives no reset time (revoked token, billing, limit without date). */
export const ACCOUNT_PAUSE_MS = 15 * 60_000;

/**
 * What a turn has seen so far: whether text was written, whether anything was shown or done (a tool call ran:
 * asking another account would run it twice), and whether the account said it is at its limit.
 */
type TurnState = { wrote: boolean; acted: boolean; limited: boolean; resetsAt: number | undefined };

/** What one event shows Anna; a failed result throws, as AccountLimitError when another account can still take it. */
function shown(event: Internal, state: TurnState): ReggieEvent[] {
  switch (event.type) {
    case "limit":
      state.limited = true;
      state.resetsAt = event.resetsAt ?? state.resetsAt;
      return [];
    case "failed":
      if (state.limited && !state.acted) throw new AccountLimitError(state.resetsAt);
      throw new Error(`Reggie stopped: ${event.reason}`);
    case "text_block":
      return state.wrote ? [{ type: "text", delta: "\n\n" }] : [];
    default:
      state.wrote ||= event.type === "text";
      state.acted = true;
      return [event];
  }
}

/**
 * One Reggie turn through the Agent SDK; `query` and `startup` are injected so tests never reach the network.
 * Accounts (`credentialsOf`) are tried in order: one that hits its limit rests until its reset and the question goes to
 * the next, as long as nothing was shown or done yet (a tool call already ran: retrying would run it twice).
 * With `startup`, each turn leaves a started process behind for the next one (same tools, same account), so the next
 * message skips the process start. shortcut: one spare at a time; two messages at once, the second starts cold.
 */
export function createReggie(
  query: QueryFn,
  env: NodeJS.ProcessEnv = process.env,
  startup?: StartupFn,
  now: () => number = Date.now,
): ReggieRun {
  const found = credentialsOf(env);
  // No account: one run without credential, which REGGIE_LOCAL_LOGIN allows and sdkEnv refuses otherwise.
  const accounts: (Credential | undefined)[] = found.length > 0 ? found : [undefined];
  const restsUntil = new Map<number, number>();
  let spare: { tools: ReggieTool[]; account: number; warm: Promise<WarmQuery> } | undefined;

  const open = async (prompt: string, tools: ReggieTool[], account: number) => {
    const warm = spare?.tools === tools && spare.account === account ? spare.warm : undefined;
    if (spare && !warm) void spare.warm.then((w) => w.close(), noop);
    spare = undefined;
    const cold = () => query({ prompt, options: reggieOptions(tools, env, accounts[account]) });
    return warm ? warm.then((w) => w.query(prompt), cold) : cold();
  };

  async function* turn(prompt: string, tools: ReggieTool[], account: number): AsyncGenerator<ReggieEvent> {
    const state: TurnState = { wrote: false, acted: false, limited: false, resetsAt: undefined };
    for await (const message of await open(prompt, tools, account)) {
      for (const event of eventsOf(message)) yield* shown(event, state);
    }
    // A limit the SDK closed without an error result is still a limit, not an empty answer.
    if (state.limited && !state.acted) throw new AccountLimitError(state.resetsAt);
  }

  const rest = (account: number, error: AccountLimitError) => {
    const until = error.resetsAt ?? now() + ACCOUNT_PAUSE_MS;
    restsUntil.set(account, until);
    // A position, never the token: logs are not a place for secrets.
    console.error(`Reggie : compte ${account + 1} à sa limite jusqu'à ${new Date(until).toISOString()}`);
  };

  const keepSpare = (tools: ReggieTool[], account: number) => {
    if (!startup) return;
    const warm = startup({ options: reggieOptions(tools, env, accounts[account]) });
    warm.catch(noop); // a spare that fails to start only means a cold start next time
    spare = { tools, account, warm };
  };

  return async function* ({ prompt, tools }) {
    for (const [account] of accounts.entries()) {
      if ((restsUntil.get(account) ?? 0) > now()) continue;
      try {
        yield* turn(prompt, tools, account);
        keepSpare(tools, account);
        return;
      } catch (error) {
        if (!(error instanceof AccountLimitError)) throw error;
        rest(account, error);
      }
    }
    console.error("Reggie : tous les comptes sont à leur limite");
    throw new ReggieBusyError();
  };
}

const noop = () => {};
