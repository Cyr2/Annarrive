/** The short form of a phase name when the full one does not fit under its segment. */
export const SHORT: Record<string, string> = { Développement: "Dév.", Spécifique: "Spé.", Affûtage: "Affût." };

/** Space between two labels, and between two segments of the frieze (its `gap-1`). */
const LABEL_GAP = 8;
export const SEGMENT_GAP = 4;

export type LabelInput = {
  /** Width of the frieze, in px. */
  width: number;
  /** Weeks of each phase, in order. */
  weeks: number[];
  names: string[];
  current: number;
  /** Width of a text in the caption font, bold for the current phase. */
  measure: (text: string, bold: boolean) => number;
};
export type Label = { x: number; text: string } | null;

/**
 * Each phase name under its own segment (mockup programme-v2, B): the current one whole and bold from its segment's
 * start, right-aligned when it would run past the end; each other from its segment's start, at least 8 px after the
 * previous label, inside its segment, the last right-aligned to the end; the short form when the full one does not
 * fit, and none on screen when even that does not (VoiceOver still reads them all).
 */
export function phaseLabels({ width, weeks, names, current, measure }: LabelInput): Label[] {
  const total = weeks.reduce((a, b) => a + b, 0);
  const usable = width - SEGMENT_GAP * (weeks.length - 1);
  let x = 0;
  const segments = weeks.map((w) => {
    const s = { x0: x, x1: x + (usable * w) / total };
    x = s.x1 + SEGMENT_GAP;
    return s;
  });
  const last = weeks.length - 1;
  const labels: Label[] = names.map(() => null);
  const curName = names[current] ?? "";
  const curW = measure(curName, true);
  const curX = current === last ? width - curW : Math.min(segments[current]?.x0 ?? 0, width - curW);
  labels[current] = { x: curX, text: curName };
  let prevEnd = Number.NEGATIVE_INFINITY;
  names.forEach((name, i) => {
    const s = segments[i];
    if (i === current || !s) {
      if (i === current) prevEnd = curX + curW;
      return;
    }
    const lo = Math.max(s.x0, prevEnd + LABEL_GAP);
    const hi = Math.min(i === last ? width : s.x1 + SEGMENT_GAP, i < current ? curX - LABEL_GAP : width);
    const fit = placed(name, lo, hi, i === last ? prevEnd + LABEL_GAP : null, measure);
    if (!fit) return;
    labels[i] = { x: fit.x, text: fit.text };
    prevEnd = fit.x + fit.w;
  });
  return labels;
}

/**
 * A name from `lo`, within `hi`. The last one (`free`: where the free room before it starts) is right-aligned to the
 * end and, when its own segment is too short, borrows that free room.
 */
function placed(name: string, lo: number, hi: number, free: number | null, measure: LabelInput["measure"]) {
  const fit = fitted(name, hi - lo, measure) ?? (free === null ? undefined : fitted(name, hi - free, measure));
  return fit && { ...fit, x: free === null ? lo : hi - fit.w };
}

/** The full name if it fits in `room`, else its short form if that does. */
function fitted(name: string, room: number, measure: LabelInput["measure"]) {
  for (const text of SHORT[name] ? [name, SHORT[name]] : [name]) {
    const w = measure(text, false);
    if (w <= room) return { text, w };
  }
  return undefined;
}
