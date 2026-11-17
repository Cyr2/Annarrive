import { useEffect, useState } from "react";

type Area = { top: number; height: number };

/**
 * The part of the screen the keyboard leaves visible, while it is up (iOS Safari shrinks the visual viewport,
 * not the layout one). Undefined when nothing covers the page.
 */
export function useVisibleArea(): Area | undefined {
  const [area, setArea] = useState<Area>();
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const measure = () =>
      setArea(
        viewport.height < window.innerHeight - 1 ? { top: viewport.offsetTop, height: viewport.height } : undefined,
      );
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
