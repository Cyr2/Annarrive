import { MotionConfig, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SPRING_BUBBLE, SPRING_STEP } from "../../lib/motion.ts";
import { Button } from "../../ui/Button.tsx";
import { usePlan } from "../plan/store.ts";

/** The guided tour over Aujourd'hui: what each part is for, shown once. A missing target centers the bubble. */
const BUBBLES = [
  { target: "main article", text: "Ta séance du jour. Touche la carte pour voir chaque étape et son allure." },
  {
    target: "[data-tour='actions']",
    text: "Reggie répond à tes questions. Déplacer, Changer et Pas dispo règlent un imprévu en deux gestes.",
  },
  { target: "nav a[href='/semaine']", text: "Semaine montre tes courses, tes cours et ta muscu, jour par jour." },
  { target: undefined, text: "Dans Semaine, appuie sur une séance et glisse-la vers un autre jour pour la déplacer." },
];

const PAD = 8;

function useTargetRect(selector: string | undefined) {
  const [rect, setRect] = useState<DOMRect>();
  const loaded = usePlan((s) => s.today);
  // biome-ignore lint/correctness/useExhaustiveDependencies: measures again once Aujourd'hui has loaded
  useLayoutEffect(() => {
    const el = selector ? document.querySelector(selector) : null;
    el?.scrollIntoView({ block: "center" });
    const measure = () => setRect(el?.getBoundingClientRect());
    measure();
    addEventListener("resize", measure);
    return () => removeEventListener("resize", measure);
  }, [selector, loaded]);
  return rect;
}

export function Tour({ onEnd }: { onEnd: () => void }) {
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

  const above = rect !== undefined && rect.top + rect.height / 2 > innerHeight / 2;
  const place = !rect
    ? { top: "50%", transform: "translateY(-50%)" }
    : above
      ? { bottom: innerHeight - rect.top + PAD * 2 }
      : { top: rect.bottom + PAD * 2 };

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
            // Solid enough to read over the dimmed screen.
            className="glass flex flex-col gap-4 rounded-card bg-glass-solid p-5"
          >
            <p className="t-body m-0">{bubble?.text}</p>
            <div ref={actions} className="flex items-center gap-2">
              <span className="t-cap flex-1">
                {index + 1} sur {BUBBLES.length}
              </span>
              {!last && (
                <Button variant="link" onClick={onEnd}>
                  Passer
                </Button>
              )}
              <Button variant="tintedBlue" onClick={() => (last ? onEnd() : setIndex(index + 1))}>
                {last ? "C'est compris" : "Suivant"}
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </MotionConfig>
  );
}
