import type { UnavailableInput, UnavailableReason } from "../../api/client.ts";
import type { IconName } from "../../ui/Icon.tsx";

/** The "Pas dispo" flow of docs/interactions.md, as data and pure steps. */

export const REASONS: { value: UnavailableReason; label: string; effect: string; icon: IconName }[] = [
  { value: "time", label: "Pas le temps", effect: "Reggie cherche un autre créneau", icon: "clock" },
  { value: "tired", label: "Fatiguée", effect: "Repos aujourd'hui, la suite est allégée si besoin", icon: "moon" },
  { value: "sick", label: "Malade", effect: "Repos conseillé, footing tranquille si tu veux", icon: "sick" },
  { value: "pain", label: "Douleur", effect: "Deux questions, puis une séance adaptée", icon: "pain" },
  { value: "other", label: "Autre", effect: "Explique à Reggie", icon: "reggie" },
];

export const ZONES = ["Mollet", "Genou", "Cheville", "Hanche", "Pied", "Autre"];

export type Draft = {
  reason?: UnavailableReason;
  fever?: boolean;
  zone?: string;
  pain: number;
  /** Last day included; undefined for "Juste aujourd'hui". */
  until?: string;
  untilOn: boolean;
};

export const EMPTY: Draft = { pain: 2, untilOn: false };

export type Step = "reason" | "fever" | "zone" | "pain" | "summary";

/** Where "Continuer" leads from the current step. `time` and `other` leave the sheet (Déplacer, Reggie). */
export function nextStep(step: Step, draft: Draft): Step | "move" | "reggie" {
  if (step === "reason") {
    if (draft.reason === "time") return "move";
    if (draft.reason === "other") return "reggie";
    if (draft.reason === "sick") return "fever";
    if (draft.reason === "pain") return "zone";
    return "summary";
  }
  if (step === "zone") return "pain";
  return "summary";
}

/** Whether "Continuer" can be pressed on this step. */
export function canContinue(step: Step, draft: Draft): boolean {
  if (step === "reason") return Boolean(draft.reason) && (!draft.untilOn || Boolean(draft.until));
  if (step === "fever") return draft.fever !== undefined;
  if (step === "zone") return Boolean(draft.zone);
  return true;
}

/** What the server receives. Sickness has no duration: it lasts until she says she feels better. */
export function toInput(draft: Draft, sessionId: string): UnavailableInput | undefined {
  const until = draft.untilOn && draft.reason !== "sick" ? draft.until : undefined;
  switch (draft.reason) {
    case "tired":
      return { sessionId, reason: "tired", until };
    case "sick":
      return draft.fever === undefined ? undefined : { sessionId, reason: "sick", fever: draft.fever };
    case "pain":
      return draft.zone ? { sessionId, reason: "pain", zone: draft.zone, pain: draft.pain, until } : undefined;
    default:
      return undefined;
  }
}

/** Advice shown with the pain slider: never a diagnosis, a professional past 4 or 3 days. */
export function painAdvice(pain: number): string {
  return pain <= 3
    ? "Pas de fractionné : footing en endurance fondamentale ou vélo."
    : "Repos ou vélo conseillé. Si tu cours : 20 min tranquille, arrête-toi si ça monte. Plus de 3 jours : kiné ou médecin.";
}
