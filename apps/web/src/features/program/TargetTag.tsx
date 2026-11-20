import type { Program } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { duration } from "../../lib/date.ts";
import { Icon } from "../../ui/Icon.tsx";
import { useSheet } from "../sheets/store.ts";

/** Reachable reads as done-able (green and a check), ambitious as a calm heads-up (amber and a flag). */
const TAGS = {
  reachable: { label: "Atteignable", icon: "check", className: "bg-ok-wash text-ok-deep" },
  ambitious: { label: "Ambitieux", icon: "flag", className: "bg-warn-wash text-warn-deep" },
} as const;

/** What « En parler avec Reggie » sends for her. */
export const QUESTIONS = {
  reachable: "Mon objectif est atteignable : comment je m'y prends ?",
  ambitious: "Pourquoi mon objectif est ambitieux ? Qu'est-ce que je peux faire ?",
} as const;

export type TargetKind = keyof typeof TAGS;
type Why = NonNullable<Program["goal"]["targetWhy"]>;

const TAG_CLASS = "t-label inline-flex flex-none items-center gap-1 self-start rounded-full px-3 py-1 font-semibold";

/** "8 %", "moins de 1 %", with a no-break space so "%" never wraps alone. */
const percent = (fraction: number) => {
  const value = Math.round(fraction * 100);
  return `${value < 1 ? "moins de 1" : value} %`;
};

/** The verdict in plain words, from what it rests on (P19). Never a proposed time (P20). */
export function targetReasons(kind: TargetKind, why: Why): string[] {
  const now = `Aujourd'hui, ton niveau te donne environ ${duration(Math.round(why.currentMin))} sur cette course.`;
  if (why.gain <= 0) return [now, "Ta cible est déjà à ton niveau : le plan sert à la tenir le jour J."];
  return [
    now,
    `Ta cible demande de gagner ${percent(why.gain)} sur les ${why.weeks} semaines d'entraînement du plan.`,
    `En général, on gagne jusqu'à ${percent(why.gainMax)} sur cette durée. ${
      kind === "ambitious"
        ? "Ta cible va au-delà : c'est jouable, avec peu de marge."
        : "Ta cible reste dans cette marge."
    }`,
  ];
}

type Props = { kind: TargetKind; why?: Program["goal"]["targetWhy"]; className?: string };

/**
 * The gentle class of her own target. Never a proposed time, never discouraging. With what the verdict rests on,
 * it is a button: a tap explains it in a sheet (TargetSheet), which offers to talk it over with Reggie.
 */
export function TargetTag({ kind, why, className }: Props) {
  const tag = TAGS[kind];
  const show = useSheet((s) => s.show);
  const face = (
    <>
      <Icon name={tag.icon} size={16} stroke={2.5} />
      {tag.label}
    </>
  );
  if (!why) return <span className={cx(TAG_CLASS, tag.className, className)}>{face}</span>;
  return (
    <button
      type="button"
      onClick={() => show({ kind: "target" })}
      className={cx(TAG_CLASS, "press min-h-11 border-0 py-0 pr-2", tag.className, className)}
    >
      {face}
      <Icon name="chevronRight" size={14} stroke={2.5} />
    </button>
  );
}

/** The onboarding server speaks French ("atteignable"); the app's tags are keyed in English. */
export const VERDICT_KIND = { atteignable: "reachable", ambitieux: "ambitious" } as const;
