import { useId, useRef } from "react";
import type { Program } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { duration } from "../../lib/date.ts";
import { Icon } from "../../ui/Icon.tsx";
import { TextButton } from "../../ui/TextButton.tsx";
import { TalkLink } from "../reggie/TalkLink.tsx";

/** Reachable reads as done-able (green and a check), ambitious as a calm heads-up (amber and a flag). */
const TAGS = {
  reachable: { label: "Atteignable", icon: "check", className: "bg-ok-wash text-ok-deep" },
  ambitious: { label: "Ambitieux", icon: "flag", className: "bg-warn-wash text-warn-deep" },
} as const;

/** What « En parler avec Reggie » sends for her. */
const QUESTIONS = {
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

type Props = { kind: TargetKind; why?: Program["goal"]["targetWhy"]; goal?: string; className?: string };

/**
 * The gentle class of her own target. Never a proposed time, never discouraging. With what the verdict rests on,
 * it is a button: a tap explains it, and offers to talk it over with Reggie.
 */
export function TargetTag({ kind, why, goal, className }: Props) {
  const tag = TAGS[kind];
  if (!why) {
    return (
      <span className={cx(TAG_CLASS, tag.className, className)}>
        <Icon name={tag.icon} size={16} stroke={2.5} />
        {tag.label}
      </span>
    );
  }
  return <TargetButton kind={kind} why={why} goal={goal} className={className} />;
}

function TargetButton({ kind, why, goal, className }: Props & { why: Why }) {
  const tag = TAGS[kind];
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        className={cx(TAG_CLASS, "press min-h-11 border-0 py-0 pr-2", tag.className, className)}
      >
        <Icon name={tag.icon} size={16} stroke={2.5} />
        {tag.label}
        <Icon name="chevronRight" size={14} stroke={2.5} />
      </button>
      <div
        ref={box}
        id={id}
        popover="auto"
        role="dialog"
        aria-labelledby={`${id}-title`}
        data-variant="sheet"
        className="surface pop-in m-auto w-[min(22rem,calc(100vw-32px))] rounded-card border-0 p-5 text-ink shadow-float backdrop:bg-scrim"
      >
        <div className="flex flex-col gap-3">
          <h2 id={`${id}-title`} className="t-title">
            {kind === "ambitious" ? "Pourquoi ambitieux ?" : "Pourquoi atteignable ?"}
          </h2>
          {targetReasons(kind, why).map((line) => (
            <p key={line} className="t-body m-0">
              {line}
            </p>
          ))}
          <div className="flex items-center justify-between gap-2">
            <TalkLink
              className="-ml-1 text-left"
              context={goal ?? "Ton objectif"}
              about={{ screen: "program" }}
              question={QUESTIONS[kind]}
              onGo={() => box.current?.hidePopover()}
            />
            <TextButton tone="ink" popoverTarget={id} popoverTargetAction="hide">
              OK
            </TextButton>
          </div>
        </div>
      </div>
    </>
  );
}

/** The onboarding server speaks French ("atteignable"); the app's tags are keyed in English. */
export const VERDICT_KIND = { atteignable: "reachable", ambitieux: "ambitious" } as const;
