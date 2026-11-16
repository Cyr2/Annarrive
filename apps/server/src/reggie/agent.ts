import {
  createSdkMcpServer,
  type HookCallback,
  type Options,
  type query as sdkQuery,
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

/** `sonnet` or `opus`; the alias follows the newest model of each family. */
export const reggieModelSchema = z.enum(["sonnet", "opus"]).default("sonnet");

const WEB_TOOLS = ["WebSearch", "WebFetch"];
const BUILTIN_DENIED = ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "NotebookEdit", "Task", "Agent"];

export class ReggieUnavailableError extends AppError {
  constructor() {
    super(503, "Reggie n'est pas configuré sur ce serveur : ajoute une clé dans les variables d'environnement.");
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
 * The SDK reads CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY from this env; empty values (as in .env.example) are unset.
 * REGGIE_LOCAL_LOGIN=1 lets the eval runner use the developer machine's existing Claude Code login instead.
 */
export function sdkEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const set = Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => Boolean(e[1])));
  if (!set.CLAUDE_CODE_OAUTH_TOKEN && !set.ANTHROPIC_API_KEY && set.REGGIE_LOCAL_LOGIN !== "1")
    throw new ReggieUnavailableError();
  return set;
}

export function reggieOptions(tools: ReggieTool[], env: NodeJS.ProcessEnv): Options {
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
    env: sdkEnv(env),
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
const resultSchema = z.object({ type: z.literal("result"), subtype: z.string() });

type Internal = ReggieEvent | { type: "text_block" };

function streamEvents({ event }: z.infer<typeof streamEventSchema>): Internal[] {
  if (event.type === "content_block_delta" && event.delta?.type === "text_delta")
    return [{ type: "text", delta: event.delta.text ?? "" }];
  if (event.type !== "content_block_start") return [];
  if (event.content_block?.type === "text") return [{ type: "text_block" }];
  return WEB_TOOLS.includes(event.content_block?.name ?? "") ? [{ type: "checking" }] : [];
}

/** Maps one SDK message to Reggie events; subagent frames are ignored, a failed result throws. */
export function eventsOf(message: unknown): Internal[] {
  const stream = streamEventSchema.safeParse(message);
  if (stream.success) return stream.data.parent_tool_use_id === null ? streamEvents(stream.data) : [];
  const assistant = assistantSchema.safeParse(message);
  if (assistant.success && assistant.data.parent_tool_use_id === null) {
    return assistant.data.message.content
      .filter((b) => b.type === "tool_use")
      .map((b) => ({ type: "tool_call", name: (b.name ?? "").replace(`mcp__${MCP_SERVER}__`, ""), input: b.input }));
  }
  const result = resultSchema.safeParse(message);
  if (result.success && result.data.subtype !== "success") throw new Error(`Reggie stopped: ${result.data.subtype}`);
  return [];
}

/** One Reggie turn through the Agent SDK; `query` is injected so tests never reach the network. */
export function createReggie(query: QueryFn, env: NodeJS.ProcessEnv = process.env): ReggieRun {
  return async function* ({ prompt, tools }) {
    let wrote = false;
    for await (const message of query({ prompt, options: reggieOptions(tools, env) })) {
      for (const event of eventsOf(message)) {
        if (event.type !== "text_block") {
          wrote ||= event.type === "text";
          yield event;
        } else if (wrote) yield { type: "text", delta: "\n\n" };
      }
    }
  };
}
