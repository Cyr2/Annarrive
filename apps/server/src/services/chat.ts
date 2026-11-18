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
import type { ReggieRun } from "../reggie/agent.ts";
import { reggieTools } from "../reggie/tools.ts";
import type { Stores } from "../storage/stores.ts";
import { addDays, type Clock, dateOf, frenchMoment, toParisLocal } from "../time.ts";
import type { PlanService } from "./plan.ts";

// shortcut: Reggie sees the last messages as text, not the SDK session; switch to `resume` if answers lose the thread.
const MEMORY_SIZE = 20;

const screens: Record<ChatContext["screen"], string> = {
  today: "Aujourd'hui",
  week: "Semaine",
  program: "Programme",
  after_run: "Après la course",
  session: "Détail de la séance",
};

const parisDay = (message: ChatMessage): string => dateOf(toParisLocal(new Date(message.at)));

/** The one global conversation with Reggie, stored in `chat_message`. */
/** What Anna reads when Reggie fails; `retry: false` when Reggie is off on this server (503). */
function errorEvent(error: unknown): ChatStreamEvent {
  if (!(error instanceof AppError)) return { type: "error", error: "Reggie ne répond pas : réessaie dans un instant." };
  return error.status === 503
    ? { type: "error", error: error.message, retry: false }
    : { type: "error", error: error.message };
}

export class ChatService {
  readonly #stores: Stores;
  readonly #plan: PlanService;
  readonly #reggie: ReggieRun;
  readonly #clock: Clock;
  #sequence = 0;

  constructor(stores: Stores, plan: PlanService, reggie: ReggieRun, clock: Clock) {
    this.#stores = stores;
    this.#plan = plan;
    this.#reggie = reggie;
    this.#clock = clock;
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

  /** Typing, then the text as it comes, then the widgets, then the stored message. */
  async *send(request: ChatRequest): AsyncGenerator<ChatStreamEvent> {
    const earlier = this.#stores.chatMessage.list().slice(-MEMORY_SIZE);
    this.#save("anna", request.text, [], request.context);
    yield { type: "typing" };
    const widgets: ChatWidget[] = [];
    let text = "";
    try {
      const prompt = this.#prompt(earlier, request);
      for await (const event of this.#reggie({ prompt, tools: reggieTools(this.#plan, widgets) })) {
        // Only the words after the last tool call are the answer; what comes before narrates his steps.
        if (event.type === "text") text += event.delta;
        else if (event.type === "tool_call") text = "";
        else if (event.type === "checking") {
          yield { type: "widget", widget: { type: "checking" } };
        }
      }
    } catch (error) {
      console.error(`Reggie a échoué : ${error instanceof Error ? error.name : "inconnu"}`);
      yield errorEvent(error);
      return;
    }
    const answer = text.trim();
    if (answer) yield { type: "text", delta: answer };
    // A widget the model filled badly (an empty session, say) is dropped rather than failing the whole reply.
    const valid = widgets.filter((w) => chatWidgetSchema.safeParse(w).success);
    for (const widget of valid) yield { type: "widget", widget };
    yield { type: "done", message: this.#save("reggie", answer, valid) };
  }

  #save(role: ChatMessage["role"], text: string, widgets: ChatWidget[], context?: ChatContext): ChatMessage {
    const at = this.#clock().toISOString();
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
