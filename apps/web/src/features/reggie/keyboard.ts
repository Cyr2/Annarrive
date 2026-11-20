/** What `window.visualViewport` reports: the part of the page left visible, here above the keyboard. */
export type Visible = { height: number; offsetTop: number };

/**
 * How far the keyboard (and the bar iOS shows above it) reaches up from the bottom of the layout viewport, which a
 * fixed element's `bottom` measures from. iOS keeps the layout viewport full height and only shrinks the visual
 * one, which can also pan down inside it; Android (`interactive-widget=resizes-content`) shrinks both, so 0 there.
 */
export function keyboardInset(layoutHeight: number, visible: Visible): number {
  return Math.max(0, Math.round(layoutHeight - visible.height - visible.offsetTop));
}
