// What a sheet or an alert needs from the page under it on a phone: it stays put, and a field stays in sight.

const SCROLLS = /(auto|scroll)/;

/** Whether `node` itself scrolls further the way a finger moving by (dx, dy) pushes it. */
function scrollsBy(node: Element, dx: number, dy: number): boolean {
  const style = getComputedStyle(node);
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (node.scrollHeight <= node.clientHeight + 1 || !SCROLLS.test(style.overflowY)) return false;
    return dy > 0 ? node.scrollTop > 0 : node.scrollTop + node.clientHeight < node.scrollHeight - 1;
  }
  if (node.scrollWidth <= node.clientWidth + 1 || !SCROLLS.test(style.overflowX)) return false;
  return dx > 0 ? node.scrollLeft > 0 : node.scrollLeft + node.clientWidth < node.scrollWidth - 1;
}

/**
 * A finger moving by (dx, dy) from `target` scrolls something inside `container`, or works a field (a caret, a
 * selection). Anything else would scroll the page behind, the only scroller iOS finds.
 */
export function movesInside(target: EventTarget | null, container: Element, dx: number, dy: number): boolean {
  const start = target instanceof Element ? target : null;
  if (!start || !container.contains(start)) return false;
  if (start.closest("input, textarea, select")) return true;
  for (let node: Element | null = start; node && node !== container.parentElement; node = node.parentElement)
    if (scrollsBy(node, dx, dy)) return true;
  return false;
}

/**
 * While an overlay is up, the page under it does not scroll. iOS ignores `overflow: hidden` on the page for a
 * finger, and scrolls it from the scrim, the header, or a list already at its end: every touch move that scrolls
 * nothing inside `container` is cancelled. Returns what ends the lock.
 */
export function lockScroll(container: Element): () => void {
  let from: { x: number; y: number } | undefined;
  const start = (event: TouchEvent) => {
    const touch = event.touches[0];
    // Two fingers zoom: left to the browser.
    from = touch && event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : undefined;
  };
  const move = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (!from || !touch || !event.cancelable) return;
    if (!movesInside(event.target, container, touch.clientX - from.x, touch.clientY - from.y)) event.preventDefault();
  };
  document.addEventListener("touchstart", start, { capture: true, passive: true });
  document.addEventListener("touchmove", move, { capture: true, passive: false });
  return () => {
    document.removeEventListener("touchstart", start, { capture: true });
    document.removeEventListener("touchmove", move, { capture: true });
  };
}

type Edges = { top: number; bottom: number };

/** Room kept between a field and the edge of what is visible (the keyboard, the sheet's footer). */
export const FIELD_MARGIN = 16;

/** How far to scroll so `field` shows whole inside `view`, the least move possible: 0 when it already does. */
export function revealDelta(field: Edges, view: Edges, margin = FIELD_MARGIN): number {
  const below = field.bottom + margin - view.bottom;
  const above = view.top + margin - field.top;
  if (below > 0) return Math.min(below, Math.max(0, -above));
  if (above > 0) return -above;
  return 0;
}
