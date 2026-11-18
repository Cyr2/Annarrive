import { useEffect, useLayoutEffect, useRef } from "react";
import { reducedMotion, SLIDE_ROW, slideFrom } from "../../lib/motion.ts";
import { usePlan } from "../plan/store.ts";
import { changedIds } from "./week.ts";

/** The session she just dropped: dnd-kit already lands it on its new slot, it must not slide a second time. */
let dropped: string | undefined;
export function markDropped(id: string) {
  dropped = id;
}

const rowsIn = (root: HTMLElement | null) => [...(root?.querySelectorAll<HTMLElement>("[data-row]") ?? [])];

/**
 * Semaine shows what moved: when the week on screen changes (adapted, a class cancelled, Annuler, a drop), each row
 * slides from where it was to its new place (FLIP), and the rows that changed glow twice. The old places are read
 * the instant the store changes, before React draws the new week. Under reduced motion: one short glow, no slide.
 */
export function useWeekMotion(offset: number) {
  const root = useRef<HTMLDivElement>(null);
  const shown = useRef(offset);
  shown.current = offset;
  const pending = useRef<{ before: Map<string, DOMRect>; changed: Set<string>; skip?: string }>(undefined);

  useEffect(
    () =>
      usePlan.subscribe((state, previous) => {
        const after = state.weeks[shown.current];
        const before = previous.weeks[shown.current];
        if (!after || !before || after === before) return;
        const changed = changedIds(before, after);
        if (changed.length === 0) return;
        const rects = rowsIn(root.current).map((row) => [row.dataset.row ?? "", row.getBoundingClientRect()] as const);
        pending.current = { before: new Map(rects), changed: new Set(changed), skip: dropped };
        dropped = undefined;
      }),
    [],
  );

  useLayoutEffect(() => {
    const change = pending.current;
    if (!change) return;
    pending.current = undefined;
    const still = reducedMotion();
    // Every place read first, then every animation started: one layout, not one per row.
    const rows = rowsIn(root.current).map((row) => ({
      row,
      id: row.dataset.row ?? "",
      now: row.getBoundingClientRect(),
    }));
    for (const { row, id, now } of rows) {
      const was = change.before.get(id);
      if (!still && was?.height && now.height && id !== change.skip) {
        slideFrom(row, was.left - now.left, was.top - now.top, SLIDE_ROW);
      }
    }
    // The glow restarts even on a row that glowed a moment ago: off, one style flush, on (week.css).
    const glowing = rows.filter(({ id }) => change.changed.has(id)).map(({ row }) => row);
    for (const row of glowing) row.classList.remove("week-changed");
    root.current?.getBoundingClientRect();
    for (const row of glowing) row.classList.add("week-changed");
  });

  return root;
}
