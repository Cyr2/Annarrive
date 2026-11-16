import { randomUUID } from "node:crypto";
import type {
  ChatContext,
  ChatHistory,
  ChatMessage,
  ChatRequest,
  ChatStreamEvent,
  ChatWidget,
} from "@talaria/protocol";
import { AppError } from "../errors.ts";
import type { ReggieRun } from "../reggie/agent.ts";
import { reggieTools } from "../reggie/tools.ts";
import type { Stores } from "../storage/stores.ts";
import { type Clock, dateOf, frenchMoment, toParisLocal } from "../time.ts";
import type { PlanService } from "./plan.ts";

/** What the screen shows when it opens the conversation. */
const HISTORY_SIZE = 100;
// shortcut: Reggie sees the last messages as text, not the SDK session; switch to `resume` if answers lose the thread.
const MEMORY_SIZE = 20;

const screens: Record<ChatContext["screen"], string> = {
  today: "Aujourd'hui",
  week: "Semaine",
  program: "Programme",
  after_run: "Après la course",
  session: "Détail de la séance",
};

/** The one global conversation with Reggie, stored in `chat_message`. */
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

  history(): ChatHistory {
    return { messages: this.#stores.chatMessage.list().slice(-HISTORY_SIZE) };
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
        if (event.type === "text") {
          text += event.delta;
          yield event;
        } else if (event.type === "checking") {
          yield { type: "widget", widget: { type: "checking" } };
        }
      }
    } catch (error) {
      console.error(`Reggie a échoué : ${error instanceof Error ? error.name : "inconnu"}`);
      const message = error instanceof AppError ? error.message : "Reggie ne répond pas : réessaie dans un instant.";
      yield { type: "error", error: message };
      return;
    }
    for (const widget of widgets) yield { type: "widget", widget };
    yield { type: "done", message: this.#save("reggie", text.trim(), widgets) };
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
