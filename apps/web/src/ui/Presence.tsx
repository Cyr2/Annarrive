import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useLayoutEffect,
  useReducer,
  useRef,
} from "react";
import { cx } from "../lib/cx.ts";
import { reducedMotion, SHEET_PAGE_REDUCED, SLIDE_CARD, slideFrom } from "../lib/motion.ts";

const keyOf = (element: ReactElement) => element.key ?? "";

/** Where each card now sits (a leaving one keeps its last place); with `slide`, each one that moved slides there. */
function place(box: HTMLElement | null, tops: Map<string, number>, out: Set<string>, slide: boolean) {
  const next = new Map<string, number>();
  for (const child of box?.children ?? []) {
    if (!(child instanceof HTMLElement) || child.dataset.leaving) continue;
    const key = child.dataset.key ?? "";
    next.set(key, child.offsetTop);
    const top = tops.get(key);
    if (slide && top !== undefined) slideFrom(child, 0, top - child.offsetTop, SLIDE_CARD);
  }
  for (const key of out) {
    const top = tops.get(key);
    if (top !== undefined) next.set(key, top);
  }
  return next;
}

/**
 * A card that goes folds its height and the gap under it on the cards' spring, so the page shortens with it instead
 * of dropping hundreds of pixels at once. Under reduced motion it only fades, then the page closes up.
 */
function collapse(card: HTMLElement, done: () => void) {
  const gap = getComputedStyle(card.parentElement ?? card).rowGap;
  const motion = !reducedMotion();
  const frames = motion
    ? [
        { height: `${card.offsetHeight}px`, marginBottom: "0px" },
        { height: "0px", marginBottom: `-${gap}` },
      ]
    : [{ opacity: 1 }, { opacity: 0 }];
  card.animate(frames, { ...(motion ? SLIDE_CARD : SHEET_PAGE_REDUCED), fill: "forwards" }).finished.then(done, done);
}

/** Starts folding each card that goes, once; a card back before it finished unfolds at once. */
function fold(
  box: HTMLElement | null,
  kept: Set<string>,
  out: Set<string>,
  folding: Set<string>,
  done: (key: string) => void,
) {
  const cardOf = (key: string) => box?.querySelector<HTMLElement>(`:scope > [data-key="${CSS.escape(key)}"]`);
  for (const key of kept) {
    if (!folding.has(key)) continue;
    for (const animation of cardOf(key)?.getAnimations() ?? []) animation.cancel();
  }
  for (const key of out) {
    const card = cardOf(key);
    if (!card || folding.has(key)) continue;
    folding.add(key);
    collapse(card, () => {
      folding.delete(key);
      done(key);
    });
  }
}

/**
 * A column of cards that come and go (Aujourd'hui): a new card rises 8 px, a card that goes fades and shrinks to 97 %
 * while its place folds away, and the cards around it close the gap on a spring. Nothing moves on the first render, nor while
 * `settled` is false (what the first screen adds in its next frames arrives still). Plain CSS and WAAPI, no Motion:
 * it sits on the first screen, whose file stays small. Everything it remembers is written at commit only, so a
 * render React throws away (deferred, interrupted) changes nothing.
 */
export function Presence({ children, settled = true }: { children: ReactNode; settled?: boolean }) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const box = useRef<HTMLDivElement>(null);
  const live = useRef(false);
  const shownBefore = useRef<ReactElement[]>([]);
  const finished = useRef(new Set<string>());
  const born = useRef(new Set<string>());
  const tops = useRef(new Map<string, number>());
  const folding = useRef(new Set<string>());

  const now = Children.toArray(children).filter(isValidElement);
  const keys = new Set(now.map(keyOf));
  const before = new Set(shownBefore.current.map(keyOf));
  const leaving = shownBefore.current.filter((e) => !keys.has(keyOf(e)) && !finished.current.has(keyOf(e)));
  const out = new Set(leaving.map(keyOf));
  const fresh = live.current ? [...keys].filter((key) => !before.has(key)) : [];
  const rising = new Set([...fresh, ...[...born.current].filter((key) => keys.has(key))]);
  const shown = [...leaving, ...now];

  // Only when cards come or go: a card whose text rewraps is not a reason to slide its neighbours.
  const shape = [...keys].join("|");
  const lastShape = useRef(shape);
  useLayoutEffect(() => {
    const slide = live.current && shape !== lastShape.current && !reducedMotion();
    live.current = settled;
    lastShape.current = shape;
    shownBefore.current = shown;
    born.current = rising;
    for (const key of keys) finished.current.delete(key);
    tops.current = place(box.current, tops.current, out, slide);
    fold(box.current, keys, out, folding.current, (key) => {
      finished.current.add(key);
      rerender();
    });
  });

  return (
    <div ref={box} className="relative flex flex-col gap-6">
      {shown.map((element) => {
        const key = keyOf(element);
        const going = out.has(key);
        return (
          <div
            key={key}
            data-key={key}
            data-leaving={going || undefined}
            inert={going}
            className={cx(
              "flex flex-col gap-6 empty:hidden",
              rising.has(key) && "rise",
              going && "card-out overflow-hidden",
            )}
          >
            {element}
          </div>
        );
      })}
    </div>
  );
}
