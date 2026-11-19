// Navigation inside a sheet. Its own small file, without Motion: SheetHost, in the first screen's file, calls it.
import { SHEET_PAGE, SHEET_PAGE_REDUCED } from "../lib/motion.ts";

/** The content of the sheet on screen, copied as another takes its place, so it can slide out as the next slides in. */
type Handoff = { ghost: HTMLElement; height: number; forward: boolean };
let onScreen: HTMLElement | null = null;
let handoff: Handoff | undefined;
const PAGE = "sheet-page";
// The header row, the content and the footer of the sheet on screen, not the copies still playing out.
const PART = "[data-sheet-part]:not([data-sheet-ghost] *)";

/**
 * The sheet now on screen (Sheet.tsx, before the first paint): it plays in what took the place of the one before,
 * unless it has just risen from nothing. Returns what to call once it leaves the screen.
 */
export function sheetOnScreen(panel: HTMLElement, rising: boolean, still: boolean, settle: () => void) {
  onScreen = panel;
  if (rising) handoff = undefined;
  else playHandoff(panel, still, settle);
  return () => {
    if (onScreen === panel) onScreen = null;
  };
}

/** What she typed or ticked shows in the copy too: cloning keeps only the fields' first values. */
function keepFields(from: Element, to: Element) {
  const copies = to.querySelectorAll("input, textarea, select");
  from.querySelectorAll("input, textarea, select").forEach((field, index) => {
    const copy = copies[index];
    if (field instanceof HTMLInputElement && copy instanceof HTMLInputElement) copy.checked = field.checked;
    if ("value" in field && copy && "value" in copy && typeof field.value === "string") copy.value = field.value;
  });
}

/**
 * Another sheet or another step is about to take the place of the one on screen (SheetHost, or a new `step`): its
 * header, content and footer are copied where they stand, mid-slide included, before React swaps them. The sheet
 * that comes next plays the copy out (playHandoff).
 */
export function handOffSheet(forward: boolean) {
  const panel = onScreen;
  if (!panel) return;
  const ghost = document.createElement("div");
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  ghost.dataset.sheetGhost = "";
  ghost.style.cssText = "position:absolute;inset:0;pointer-events:none";
  for (const part of panel.querySelectorAll<HTMLElement>(PART)) {
    const copy = part.cloneNode(true);
    if (!(copy instanceof HTMLElement)) continue;
    const { transform, opacity } = getComputedStyle(part);
    // The footer stays on the sheet's bottom edge, the rest on its top edge, as the height changes.
    const foot = part.dataset.sheetPart === "foot";
    const edge = foot ? panel.offsetHeight - part.offsetTop - part.offsetHeight : part.offsetTop;
    Object.assign(copy.style, {
      position: "absolute",
      margin: "0",
      left: `${part.offsetLeft}px`,
      width: `${part.offsetWidth}px`,
      height: `${part.offsetHeight}px`,
      [foot ? "bottom" : "top"]: `${edge}px`,
      transform,
      opacity,
    });
    // Only a scrolled content needs its place back (setting it costs a layout).
    if (part.scrollTop > 0) copy.dataset.scroll = String(part.scrollTop);
    keepFields(part, copy);
    ghost.append(copy);
  }
  for (const node of ghost.querySelectorAll("[id]")) node.removeAttribute("id");
  handoff = { ghost, height: panel.offsetHeight, forward };
}

/**
 * A push inside the sheet, as iOS navigates in a sheet: forward, the new content comes in from the right as the
 * old one slides a third of the way left; Retour plays it backwards. The title cross-fades in place, the height
 * follows in the sheet's own timing, and nothing blurs meanwhile (frost, as when the sheet moves). A new step
 * mid-way starts from where everything stands. Reduced motion: a cross-fade, the height at once.
 */
function playHandoff(panel: HTMLElement, still: boolean, settle: () => void) {
  const from = handoff;
  handoff = undefined;
  if (!from) return;
  for (const animation of panel.getAnimations({ subtree: true })) if (animation.id === PAGE) animation.cancel();
  panel.querySelector(":scope > [data-sheet-ghost]")?.remove();
  const to = panel.offsetHeight;
  const parts = [...panel.querySelectorAll<HTMLElement>(PART)];
  panel.append(from.ghost);
  for (const copy of from.ghost.querySelectorAll<HTMLElement>("[data-scroll]"))
    copy.scrollTop = Number(copy.dataset.scroll);
  panel.style.overflow = "clip";
  panel.toggleAttribute("data-moving", true);

  const timing = { ...(still ? SHEET_PAGE_REDUCED : SHEET_PAGE), id: PAGE };
  const [enter, leave] = from.forward ? ["100%", "-30%"] : ["-30%", "100%"];
  const fades = (part: Element) => still || part.getAttribute("data-sheet-part") === "head";
  for (const part of parts)
    part.animate(
      fades(part)
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { transform: `translateX(${enter})`, opacity: 0 },
            { transform: "none", opacity: 1 },
          ],
      timing,
    );
  const out = [...from.ghost.children].map((copy) => {
    const start = copy instanceof HTMLElement ? copy.style : undefined;
    const opacity = start?.opacity || 1;
    return copy.animate(
      fades(copy)
        ? [{ opacity }, { opacity: 0 }]
        : [
            { transform: start?.transform || "none", opacity },
            { transform: `translateX(${leave})`, opacity: 0 },
          ],
      timing,
    );
  });
  if (!still && Math.abs(from.height - to) >= 1)
    out.push(panel.animate([{ height: `${from.height}px` }, { height: `${to}px` }], timing));
  Promise.all(out.map((animation) => animation.finished)).then(
    () => {
      from.ghost.remove();
      panel.style.overflow = "";
      settle();
    },
    // Cancelled by the next step, which cleans up after it.
    () => undefined,
  );
}
