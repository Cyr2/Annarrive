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
