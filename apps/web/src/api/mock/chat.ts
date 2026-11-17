import { relativeMoment } from "../../lib/date.ts";
import type { Api, ChatInput } from "../client.ts";
import type { ChangeResult, ChatEvent, ChatMessage, ProposedSlot, Run, Widget } from "../schemas.ts";

/**
 * shortcut: a scripted Reggie that walks the flows of docs/interactions.md (malade, douleur, plus court,
 * décaler, question de santé) through the same Api actions as the buttons. The server's Reggie replaces it.
 */

type Pending =
  | { step: "fever" | "zone" }
  | { step: "pain"; zone: string }
  | { step: "slots"; sessionId: string; slots: ProposedSlot[] }
  | { step: "preview"; take: () => Promise<ChangeResult> };

export type ReggieMemory = { pending?: Pending; count: number };

export const ZONES = ["Mollet", "Genou", "Cheville", "Hanche", "Pied", "Autre"];
const SHIN = { label: "nhs.uk, douleur au tibia", url: "https://www.nhs.uk/conditions/shin-splints/" };
const FOOD = {
  label: "mayoclinic.org, manger et courir",
  url: "https://www.mayoclinic.org/healthy-lifestyle/nutrition-and-healthy-eating/in-depth/food-and-fitness/art-20048425",
};

export function slotLabel(slot: { date: string; start: string }, today: string) {
  return relativeMoment(slot.date, slot.start, today);
}

type Turn = {
  api: Api;
  text: string;
  raw: string;
  today: string;
  session?: Run;
  memory: ReggieMemory;
  pending?: Pending;
  say: (text: string, extra?: { widget?: Widget; source?: ChatMessage["source"] }) => ChatEvent;
  changed: (change: ChangeResult, text: string) => ChatEvent;
  pause: (ms: number) => Promise<unknown>;
};
type Handler = (t: Turn) => AsyncGenerator<ChatEvent> | undefined;

const onPreview: Handler = ({ pending, text, changed }) => {
  if (pending?.step !== "preview" || !text.startsWith("prendre")) return;
  return (async function* () {
    yield changed(await pending.take(), "C'est fait. Ta montre est à jour.");
  })();
};

const onSlot: Handler = ({ pending, text, today, api, changed }) => {
  if (pending?.step !== "slots") return;
  const slot = pending.slots.find((s) => slotLabel(s, today).toLowerCase() === text);
  if (!slot) return;
  return (async function* () {
    yield changed(await api.move(pending.sessionId, slot), "C'est déplacé, ta montre suit.");
  })();
};

const onFever: Handler = ({ pending, session, text, api, changed }) => {
  if (pending?.step !== "fever" || !session) return;
  const fever = text === "oui";
  return (async function* () {
    const change = await api.unavailable({ sessionId: session.id, reason: "sick", fever });
    yield fever
      ? changed(
          change,
          "Je te conseille le repos tant que tu as de la fièvre. Si tu veux quand même courir, ta séance devient 20 min tranquille.",
        )
      : changed(
          change,
          "Un rhume, alors. Tes séances restent en footing tranquille, sans fractionné, jusqu'à ce que ça aille mieux.",
        );
  })();
};

const onZone: Handler = ({ pending, raw, memory, say }) => {
  if (pending?.step !== "zone") return;
  memory.pending = { step: "pain", zone: raw };
  return (async function* () {
    yield say("Combien sur 10 quand tu marches ?", { widget: { type: "scale", label: "Douleur en marchant" } });
  })();
};

const onPain: Handler = ({ pending, text, session, today, api, memory, say }) => {
  if (pending?.step !== "pain") return;
  const pain = Number.parseInt(text, 10);
  return (async function* () {
    if (!session) {
      yield say("Pas de course aujourd'hui : repose-toi et dis-moi demain comment ça va.");
      return;
    }
    const request = { sessionId: session.id, reason: "pain" as const, zone: pending.zone, pain };
    const high = pain >= 4;
    memory.pending = { step: "preview", take: () => api.unavailable(request) };
    yield say(
      high
        ? `Je te conseille le repos ou du vélo ce soir. Si tu veux courir, 20 min tranquille, et arrête-toi si ça monte. Si ça dure plus de 3 jours, montre ton ${pending.zone.toLowerCase()} à un kiné.`
        : "Pas de fractionné ce soir. Un footing tranquille ne devrait pas aggraver ça. Arrête-toi si la douleur monte.",
    );
    const preview = {
      title: high ? "Footing tranquille · 20 min" : "Footing tranquille · 30 min",
      detail: `${slotLabel(session, today)} · allure 6:30 à 7:00`,
    };
    yield say("", {
      widget: {
        type: "preview",
        sessionId: session.id,
        optionId: "jog",
        alternative: "Plutôt du repos",
        session: { ...preview, intensity: "easy" },
      },
    });
  })();
};

const onRest: Handler = ({ text, session, api, changed }) => {
  if (!text.includes("plutôt du repos") || !session) return;
  return (async function* () {
    const change = await api.unavailable({ sessionId: session.id, reason: "tired" });
    yield changed(change, "D'accord, repos ce soir. La suite reste comme prévue.");
  })();
};

const onSick: Handler = ({ text, memory, say }) => {
  if (!text.includes("malade")) return;
  memory.pending = { step: "fever" };
  return (async function* () {
    const widget: Widget = { type: "choices", label: "Fièvre", options: ["Oui", "Non"] };
    yield say("Tu as de la fièvre ou ça touche la poitrine ?", { widget });
  })();
};

const onHurt: Handler = ({ text, memory, say }) => {
  if (!/douleur|j'ai mal|mal au|mal à/.test(text) || /tibia|grave/.test(text)) return;
  memory.pending = { step: "zone" };
  return (async function* () {
    const widget: Widget = { type: "choices", label: "Zone de la douleur", options: ZONES };
    yield say("Où est-ce que ça fait mal ?", { widget });
  })();
};

const onShorter: Handler = ({ text, session, api, memory, say }) => {
  if (!text.includes("plus court") || !session) return;
  return (async function* () {
    const option = (await api.changeOptions(session.id)).find((o) => o.id === "shorter");
    if (!option) {
      yield say("Cette séance est déjà courte. Tu peux la remplacer par du repos si besoin.");
      return;
    }
    memory.pending = { step: "preview", take: () => api.change(session.id, "shorter") };
    yield say("Voilà la version courte, même objectif.");
    const preview = { title: `${session.title} plus court`, detail: option.detail, intensity: option.intensity };
    const widget: Widget = {
      type: "preview",
      sessionId: session.id,
      optionId: "shorter",
      alternative: "Garder la séance prévue",
      session: preview,
    };
    yield say("", { widget });
  })();
};

const onMove: Handler = ({ text, session, api, memory, say }) => {
  if (!/décaler|déplacer|demain/.test(text) || !session) return;
  return (async function* () {
    const { slots } = await api.moveOptions(session.id);
    memory.pending = { step: "slots", sessionId: session.id, slots };
    yield say("Voilà les créneaux qui respectent ton plan.", {
      widget: { type: "slots", sessionId: session.id, slots },
    });
  })();
};

const onHealth: Handler = ({ text, say, pause }) => {
  const topic = /tibia|grave/.test(text) ? SHIN : /mang|nutrition|boire/.test(text) ? FOOD : undefined;
  if (!topic) return;
  return (async function* () {
    yield { type: "status", status: "searching" } satisfies ChatEvent;
    await pause(1600);
    yield topic === SHIN
      ? say(
          "Une douleur au tibia en courant vient souvent d'une hausse trop rapide du nombre de kilomètres. Je ne pose pas de diagnostic : si ça dure plus de 3 jours ou dépasse 4 sur 10, montre-la à un kiné ou un médecin.",
          { source: SHIN },
        )
      : say(
          "Un repas riche en glucides 3 h avant, léger et que tu connais, puis de l'eau par petites gorgées. Rien de nouveau le jour de la course.",
          { source: FOOD },
        );
  })();
};

const reply =
  (answer: string): Handler =>
  (t) =>
    (async function* () {
      yield t.say(answer);
    })();

const onWhy: Handler = (t) =>
  t.text.includes("pourquoi") && t.text.includes("allure")
    ? reply(
        "4:55 au kilomètre, c'est un peu plus vite que ton allure semi de 5:07. Ces fractions rendent ton allure de course plus facile le jour J. Je la calcule à partir de tes dernières sorties Garmin.",
      )(t)
    : undefined;

const onBetter: Handler = (t) =>
  t.text.includes("mieux")
    ? reply("Bonne nouvelle. Encore 3 jours de footing tranquille, puis ton plan reprend normalement.")(t)
    : undefined;

const HANDLERS = [
  onPreview,
  onSlot,
  onFever,
  onZone,
  onPain,
  onRest,
  onSick,
  onHurt,
  onShorter,
  onMove,
  onWhy,
  onHealth,
  onBetter,
];
const fallback = reply("Je note. Dis-m'en un peu plus, ou passe par un raccourci juste en dessous.");

export async function* reggie(
  api: Api,
  input: ChatInput,
  ctx: { today: string; latencyMs: number; memory: ReggieMemory },
): AsyncGenerator<ChatEvent> {
  const { memory } = ctx;
  const pending = memory.pending;
  memory.pending = undefined;
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ctx.latencyMs ? ms : 0));
  const say: Turn["say"] = (text, extra) => ({
    type: "message",
    message: { id: `r${++memory.count}`, role: "reggie", text, ...extra },
  });

  yield { type: "status", status: "thinking" } satisfies ChatEvent;
  await pause(700);
  const turn: Turn = {
    api,
    raw: input.text.trim(),
    text: input.text.trim().toLowerCase(),
    today: ctx.today,
    session: (await api.today()).session,
    memory,
    pending,
    say,
    changed: (change, text) => say(text, { widget: { type: "change", change } }),
    pause,
  };
  for (const handler of HANDLERS) {
    const answer = handler(turn);
    if (answer) {
      yield* answer;
      return;
    }
  }
  yield* fallback(turn) ?? [];
}
