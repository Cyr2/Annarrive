import { randomUUID } from "node:crypto";
import {
  type ChatContext,
  type ChatHistory,
  type ChatMessage,
  type ChatRequest,
  type ChatStreamEvent,
  type ChatWidget,
  chatWidgetSchema,
} from "@annarrive/protocol";
import { AppError } from "../errors.ts";
import { REGGIE_BUSY, ReggieBusyError, type ReggieEvent, type ReggieRun } from "../reggie/agent.ts";
import { type ReggieTool, reggieTools } from "../reggie/tools.ts";
import type { Stores } from "../storage/stores.ts";
import { addDays, type Clock, dateOf, frenchMoment, toParisLocal } from "../time.ts";
import type { FitnessService } from "./fitness.ts";
import type { IncidentService } from "./incidents.ts";
import type { PlanService } from "./plan.ts";

// shortcut: Reggie sees the last messages as text, not the SDK session; switch to `resume` if answers lose the thread.
const MEMORY_SIZE = 20;
/** Longer than a narration line (« Je regarde ta semaine. »): a reply without tools streams once it gets this long. */
const NARRATION_CHARS = 100;
/** Longer than a reply with two web searches takes: past it, a silent model process is stuck, not thinking. */
export const SILENCE_MS = 90_000;

const screens: Record<ChatContext["screen"], string> = {
  today: "Aujourd'hui",
  week: "Semaine",
  program: "Programme",
  after_run: "Après la course",
  session: "Détail de la séance",
};

const parisDay = (message: ChatMessage): string => dateOf(toParisLocal(new Date(message.at)));

/** What Anna reads when Reggie fails; `retry: false` when Reggie is off on this server (503). */
function errorEvent(error: unknown): ChatStreamEvent {
  if (!(error instanceof AppError)) return { type: "error", error: REGGIE_BUSY };
  return error.status === 503
    ? { type: "error", error: error.message, retry: false }
    : { type: "error", error: error.message };
}

const QUESTION_TOOLS = ["ask_choice", "ask_level"];

/** The events of `run`, until one takes longer than `ms` to come: then a ReggieBusyError. */
async function* untilSilent<T>(run: AsyncIterable<T>, ms: number): AsyncGenerator<T> {
  const events = run[Symbol.asyncIterator]();
  let timer: NodeJS.Timeout | undefined;
  const silence = () =>
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ReggieBusyError()), ms);
    });
  try {
    while (true) {
      const next = await Promise.race([events.next(), silence()]);
      clearTimeout(timer);
      if (next.done) return;
      yield next.value;
    }
  } finally {
    clearTimeout(timer);
    // shortcut: a stuck model process ends with its own SDK query, not killed here; kill it if they pile up.
    events.return?.().catch(() => undefined);
  }
}

/**
 * What Anna sees of a Reggie turn as it is written. Only the words after the last tool call are the answer; what
 * comes before narrates his steps. `text` is the answer so far.
 */
class Screen {
  text = "";
  #shown = 0;
  #afterTool = false;

  tool(): ChatStreamEvent[] {
    const shown = this.#shown > 0;
    this.text = "";
    this.#shown = 0;
    this.#afterTool = true;
    return shown ? [{ type: "retract" }] : [];
  }

  write(delta: string): ChatStreamEvent[] {
    // The answer starts at its first word, not at the blank line agent.ts puts between two text blocks.
    this.text = this.#shown === 0 ? (this.text + delta).trimStart() : this.text + delta;
    // After a tool, the text is the answer; before any, a short start may still be narration, so it waits.
    return this.#afterTool || this.text.length >= NARRATION_CHARS ? this.flush() : [];
  }

  flush(): ChatStreamEvent[] {
    const rest = this.text.slice(this.#shown);
    this.#shown = this.text.length;
    return rest ? [{ type: "text", delta: rest }] : [];
  }

  see(event: ReggieEvent): ChatStreamEvent[] {
    // A question's buttons or slider read nothing: the words before them are the answer, not narration.
    if (event.type === "tool_call") return QUESTION_TOOLS.includes(event.name) ? [] : this.tool();
    if (event.type === "checking") return [{ type: "widget", widget: { type: "checking" } }];
    return this.write(event.delta);
  }
}

/** The one global conversation with Reggie, stored in `chat_message`. */
export class ChatService {
  readonly #stores: Stores;
  readonly #reggie: ReggieRun;
  readonly #clock: Clock;
  readonly #incidents: IncidentService;
  readonly #silenceMs: number;
  // The same tools for every message, so Reggie's next process can start before Anna writes (agent.ts).
  // shortcut: one reply's widgets at a time; two messages sent at once would share them.
  readonly #widgets: ChatWidget[] = [];
  readonly #tools: ReggieTool[];
  #sequence = 0;

  constructor(
    stores: Stores,
    plan: PlanService,
    fitness: FitnessService,
    reggie: ReggieRun,
    clock: Clock,
    incidents: IncidentService,
    silenceMs = SILENCE_MS,
  ) {
    this.#stores = stores;
    this.#reggie = reggie;
    this.#clock = clock;
    this.#incidents = incidents;
    this.#silenceMs = silenceMs;
    this.#tools = reggieTools(plan, fitness, this.#widgets);
  }

  /** One Paris day of the conversation (today by default), and the day before it that has messages. */
  history(day = dateOf(toParisLocal(this.#clock()))): ChatHistory {
    const store = this.#stores.chatMessage;
    // Paris is UTC+1 or +2: three hours on each side hold the whole day, the filter keeps it exact.
    const messages = store
      .overlapping(`${addDays(day, -1)}T21:00`, `${addDays(day, 1)}T03:00`)
      .filter((m) => parisDay(m) === day);
    // The UTC midnight falls early on the Paris day: at most a couple of hours of it to step over.
    let earlier = store.lastBefore(`${day}T00:00`);
    while (earlier && parisDay(earlier) >= day) earlier = store.lastBefore(earlier.at);
    return { day, messages, ...(earlier ? { earlier: parisDay(earlier) } : {}) };
  }

  /**
   * Typing, then the text as it comes, then the widgets, then the stored message. Her message is stored with the
   * answer: a reply that fails before Reggie did anything leaves nothing behind, so Réessayer never stores it twice.
   */
  async *send(request: ChatRequest): AsyncGenerator<ChatStreamEvent> {
    const earlier = this.#stores.chatMessage.list().slice(-MEMORY_SIZE);
    const asked = this.#clock().toISOString();
    yield { type: "typing" };
    const widgets = this.#widgets;
    widgets.length = 0;
    const screen = new Screen();
    let acted = false;
    try {
      const prompt = this.#prompt(earlier, request);
      for await (const event of untilSilent(this.#reggie({ prompt, tools: this.#tools }), this.#silenceMs)) {
        acted ||= event.type === "tool_call";
        yield* screen.see(event);
      }
      // A turn that ends with nothing to show is a failure, never a bubble she cannot see.
      if (!screen.text.trim() && widgets.length === 0) throw new ReggieBusyError();
    } catch (error) {
      console.error(`Reggie a échoué : ${error instanceof Error ? error.name : "inconnu"}`);
      this.#incidents.recordServerError("POST /api/chat", error instanceof Error ? error : new Error(String(error)));
      // A tool already ran (a session moved, say): her message stays, so the change keeps its question.
      if (acted) this.#save("anna", request.text, [], request.context, asked);
      yield errorEvent(error);
      return;
    }
    yield* screen.flush();
    const answer = screen.text.trim();
    // A widget the model filled badly (an empty session, say) is dropped rather than failing the whole reply.
    const valid = widgets.filter((w) => chatWidgetSchema.safeParse(w).success);
    for (const widget of valid) yield { type: "widget", widget };
    this.#save("anna", request.text, [], request.context, asked);
    yield { type: "done", message: this.#save("reggie", answer, valid) };
  }

  #save(
    role: ChatMessage["role"],
    text: string,
    widgets: ChatWidget[],
    context?: ChatContext,
    at = this.#clock().toISOString(),
  ): ChatMessage {
    // Two messages can share a millisecond: the id breaks the tie so the list keeps their order.
    const id = `${at}-${String(this.#sequence++).padStart(6, "0")}-${randomUUID().slice(0, 8)}`;
    return this.#stores.chatMessage.put({ id, at, role, text, widgets, context });
  }

  #prompt(earlier: ChatMessage[], request: ChatRequest): string {
    const now = toParisLocal(this.#clock());
    const lines = [`Nous sommes ${frenchMoment(now)}, le ${dateOf(now)} (heure de Paris).`];
    if (earlier.length > 0) {
      lines.push("", "Conversation jusqu'ici :");
      for (const m of earlier) lines.push(`${m.role === "anna" ? "Anna" : "Reggie"} : ${m.text}`);
    }
    const context = request.context;
    if (context) {
      const about = context.sessionId ? `, à propos de la séance ${context.sessionId}` : "";
      lines.push("", `Anna a ouvert la conversation depuis l'écran ${screens[context.screen]}${about}.`);
    }
    lines.push("", "Nouveau message d'Anna :", request.text);
    return lines.join("\n");
  }
}
