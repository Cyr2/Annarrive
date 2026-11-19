import { MotionConfig, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SPRING_BUBBLE, SPRING_STEP } from "../../lib/motion.ts";
import { Button } from "../../ui/controls.tsx";
import { TextButton } from "../../ui/TextButton.tsx";
import { usePlan } from "../plan/store.ts";

type Bubble = { target: string; text: string };

/** The guided tour over Aujourd'hui: what each part is for, shown once. A missing target centers the bubble. */
const RUN_DAY: Bubble[] = [
  { target: "main article", text: "Ta séance du jour. Touche la carte pour voir chaque étape et son allure." },
  {
    target: "[data-tour='actions']",
    text: "Reggie répond à tes questions. Déplacer, Changer et Pas dispo règlent un imprévu en deux gestes.",
  },
];
/** Day one is often a rest day: the bubbles point at what is there, the next session and Reggie's tab. */
const REST_DAY: Bubble[] = [
  { target: "[data-tour='next']", text: "Ta prochaine séance. Touche la carte pour voir chaque étape et son allure." },
  {
    target: "[role='navigation'] a[href='/reggie']",
    text: "Reggie répond à tes questions. Un jour de séance, Déplacer, Changer et Pas dispo règlent un imprévu en deux gestes.",
  },
];
const AFTER: Bubble[] = [
  {
    target: "[data-tour='watch']",
    text: "Chaque séance part sur ta Garmin. Sa carte dit « Sur ta montre » une fois envoyée, et Programme dit si ta Garmin est reliée.",
  },
  {
    target: "[role='navigation'] a[href='/semaine']",
    text: "Semaine montre tes courses, tes cours et ta muscu. Appuie sur une séance et glisse-la vers un autre jour pour la déplacer.",
  },
  {
    target: "[role='navigation'] a[href='/programme']",
    text: "Programme garde ton objectif, les étapes de ton plan et tes réglages.",
  },
];

const PAD = 8;
/** The bubble's column: 16 px gutters, at most 384 px wide, centered. */
const BUBBLE_MAX = 384;
const ARROW = 14;
/** The room a bubble needs next to its target: three lines of text and its buttons. */
const BUBBLE_ROOM = 200;

/** Where the arrow sits along the bubble: under the target's center, kept off the rounded corners. */
function arrowLeft(rect: DOMRect): number {
  const width = Math.min(innerWidth - 32, BUBBLE_MAX);
  const left = (innerWidth - width) / 2;
  return Math.min(Math.max(rect.left + rect.width / 2 - left, 28), width - 28);
}

/** Where the bubble goes: on the roomier side of its target, or centered when there is none. */
function placeBubble(rect: DOMRect | undefined) {
  if (!rect) return { above: false, fits: false, place: { top: "50%", transform: "translateY(-50%)" } };
  const above = rect.top + rect.height / 2 > innerHeight / 2;
  // A tall target on a small phone leaves no room on either side: the bubble then sits at the bottom, over it.
  const fits = (above ? rect.top : innerHeight - rect.bottom) >= BUBBLE_ROOM;
  const place = !fits
    ? { bottom: `calc(env(safe-area-inset-bottom) + ${PAD * 2}px)` }
    : above
      ? { bottom: innerHeight - rect.top + PAD * 2 }
      : { top: rect.bottom + PAD * 2 };
  return { above, fits, place };
}

/** The page's animations that end (not a pulse that loops). */
const settling = () =>
  document.getAnimations?.().filter((a) => a.effect?.getComputedTiming().endTime !== Infinity) ?? [];

function useTargetRect(selector: string | undefined) {
  const [rect, setRect] = useState<DOMRect>();
  useLayoutEffect(() => {
    let found: Element | null = null;
    const measure = () => {
      const el = selector ? document.querySelector(selector) : null;
      if (el && el !== found) {
        el.scrollIntoView({ block: "center" });
        // A card that just appeared is still rising into place: measure again where it stops.
        void Promise.allSettled(settling().map((a) => a.finished)).then(measure);
      }
      found = el;
      const next = el?.getBoundingClientRect();
      setRect((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
    };
    measure();
    // Aujourd'hui draws its cards a frame or two after the plan arrives: look again as they appear.
    const observer = new MutationObserver(measure);
    observer.observe(document.body, { childList: true, subtree: true });
    addEventListener("resize", measure);
    // The scroll that brings the target in view may still be running: measure where it ends.
    addEventListener("scroll", measure, { capture: true, passive: true });
    return () => {
      observer.disconnect();
      removeEventListener("resize", measure);
      removeEventListener("scroll", measure, { capture: true });
    };
  }, [selector]);
  return rect;
}

export function Tour({ onEnd }: { onEnd: () => void }) {
  const runDay = usePlan((s) => Boolean(s.today?.session));
  const BUBBLES = [...(runDay ? RUN_DAY : REST_DAY), ...AFTER];
  const [index, setIndex] = useState(0);
  const bubble = BUBBLES[index] ?? BUBBLES[0];
  const rect = useTargetRect(bubble?.target);
  const actions = useRef<HTMLDivElement>(null);
  const last = index === BUBBLES.length - 1;

  // biome-ignore lint/correctness/useExhaustiveDependencies: focuses the button of each new bubble
  useEffect(() => actions.current?.querySelector<HTMLButtonElement>("button:last-child")?.focus(), [index]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onEnd();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onEnd]);

  const { above, fits, place } = placeBubble(rect);

  return (
    <MotionConfig reducedMotion="user">
      <div role="dialog" aria-modal="true" aria-label="Visite guidée" className="fixed inset-0 z-50">
        {rect ? (
          <motion.div
            aria-hidden="true"
            className="absolute top-0 left-0 rounded-card shadow-[0_0_0_200vmax_var(--color-scrim)]"
            initial={false}
            animate={{
              x: rect.left - PAD,
              y: rect.top - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
            }}
            transition={SPRING_STEP}
          />
        ) : (
          <div aria-hidden="true" className="absolute inset-0 bg-scrim" />
        )}
        <div className="absolute inset-x-4 mx-auto max-w-sm" style={place}>
          <motion.div
            key={index}
            initial={{ opacity: 0, y: above ? 8 : -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={SPRING_BUBBLE}
            data-variant="sheet"
            className="surface relative flex flex-col gap-4 rounded-card p-5 shadow-float"
          >
            {rect && fits && (
              <span
                aria-hidden="true"
                data-variant="sheet"
                className="surface absolute rotate-45 rounded-[3px] shadow-none"
                style={{
                  width: ARROW,
                  height: ARROW,
                  left: arrowLeft(rect) - ARROW / 2,
                  ...(above ? { bottom: -ARROW / 2 + 1 } : { top: -ARROW / 2 + 1 }),
                }}
              />
            )}
            <p className="t-body m-0">{bubble?.text}</p>
            <div ref={actions} className="flex items-center gap-2">
              <span className="t-cap flex-1">
                {index + 1} sur {BUBBLES.length}
              </span>
              {!last && <TextButton onClick={onEnd}>Passer</TextButton>}
              <Button variant="filled" onClick={() => (last ? onEnd() : setIndex(index + 1))}>
                {last ? "C'est compris" : "Suivant"}
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </MotionConfig>
  );
}
