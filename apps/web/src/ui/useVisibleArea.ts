import { useEffect, useState } from "react";

type Area = { top: number; height: number };

/** Less than this is a toolbar folding away, not a keyboard. */
const KEYBOARD_MIN = 120;

/**
 * The part of the screen the keyboard leaves visible, while it is up. Undefined when nothing covers the page.
 * iOS shrinks the visual viewport only; Android (`interactive-widget=resizes-content`) shrinks the window too,
 * so the keyboard shows as the window falling short of the tallest it has been at this width.
 */
export function useVisibleArea(): Area | undefined {
  const [area, setArea] = useState<Area>();
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let width = 0;
    let tallest = 0;
    const measure = () => {
      // A rotation changes the width: the tallest height is measured again.
      if (window.innerWidth !== width) [width, tallest] = [window.innerWidth, 0];
      tallest = Math.max(tallest, window.innerHeight);
      setArea(
        viewport.height < tallest - KEYBOARD_MIN ? { top: viewport.offsetTop, height: viewport.height } : undefined,
      );
    };
    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
    };
  }, []);
  return area;
}
