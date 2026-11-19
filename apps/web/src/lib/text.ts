const UE = /\bUE\s*(\d+[A-Z]?)\b/gi;
/** Separators left at either end once the codes are out: "UE1 - Français", "UE1/UE2 Anglais". */
const EDGES = /^[\s\-:·/|,]+|[\s\-:·/|,]+$/g;
const squash = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * A class from the university feed, as she reads it: "(M1M2E G3 NL) UE1 Français" is the course "Français" with
 * "UE1 · M1M2E G3 NL" under it. The unit codes come first, then what was in brackets. With no course name left,
 * the codes are the title; with nothing at all, the raw title stays.
 */
export function classTitle(raw: string): { title: string; detail?: string } {
  const groups = [...raw.matchAll(/\(([^)]*)\)/g)].map((m) => squash(m[1] ?? "")).filter(Boolean);
  const outside = raw.replace(/\([^)]*\)/g, " ");
  const codes = [...outside.matchAll(UE)].map((m) => `UE${(m[1] ?? "").toUpperCase()}`);
  const name = squash(outside.replace(UE, " ")).replace(EDGES, "");
  if (!name && codes.length === 0) return { title: squash(raw) };
  const title = name || codes.join(" · ");
  const detail = (name ? [...codes, ...groups] : groups).join(" · ");
  return detail ? { title, detail } : { title };
}

/**
 * Keeps a figure with its unit ("40 min", "8 km", "1 600 m") and a separator with the word before it, so a line
 * never ends on a number cut from its unit or starts with a lone "·".
 */
export function tidy(text: string): string {
  return text
    .replaceAll(" · ", " · ")
    .replace(/(\d) (\d{3})\b/g, "$1 $2")
    .replace(/(\d) (min|km|m|h|sur)\b/g, "$1 $2");
}
