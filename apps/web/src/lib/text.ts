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
 * The same class as a row shows it, with its first UE1 to UE4 as a pill: the pill says it, so the line under the
 * title no longer does. A class with no such unit has no pill.
 */
export function classRow(raw: string): { title: string; detail?: string; ue?: Ue } {
  const { title, detail } = classTitle(raw);
  const codes = detail?.split(" · ") ?? [];
  const index = codes.findIndex((c) => isUe(c.toLowerCase()));
  const ue = codes[index]?.toLowerCase();
  if (!ue || !isUe(ue)) return detail ? { title, detail } : { title };
  const rest = codes.filter((_, i) => i !== index).join(" · ");
  return rest ? { title, detail: rest, ue } : { title, ue };
}

/** The four teaching units of her degree, each with its own soft color (tokens.css). */
export type Ue = "ue1" | "ue2" | "ue3" | "ue4";
const isUe = (code: string): code is Ue => /^ue[1-4]$/.test(code);

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
