/** 315 s/km → "5'15": the runner's notation, so a pace never reads as a time of day. */
function minutesSeconds(secondsPerKm: number): string {
  const total = Math.round(secondsPerKm);
  return `${Math.floor(total / 60)}'${String(total % 60).padStart(2, "0")}`;
}

/** "5'15 /km", or "6'37 à 7'53 /km" for a range: the unit is always written, everywhere in the app. */
export function paceLabel(secondsPerKm: number | readonly [number, number]): string {
  const [a, b] = typeof secondsPerKm === "number" ? [secondsPerKm, secondsPerKm] : secondsPerKm;
  const [fast, slow] = [minutesSeconds(Math.min(a, b)), minutesSeconds(Math.max(a, b))];
  // A no-break space: the unit never starts a line of its own.
  return `${fast === slow ? fast : `${fast} à ${slow}`}\u00a0/km`;
}
