/** Where the programme stands: the light climbs and warms from base to race week. */
export type SkyPhase = "base" | "build" | "peak" | "race";

/**
 * « Ciel du matin »: the one backdrop behind the whole app, fixed, under every screen, sheet and onboarding.
 * A dawn gradient, a soft sun and a cool haze that drift on the compositor (transform and opacity only, no
 * filter, no repaint), still under reduced motion.
 */
export function Sky({ phase = "base" }: { phase?: SkyPhase }) {
  return (
    <div aria-hidden="true" className="sky" data-phase={phase}>
      <div className="sky-sun" />
      <div className="sky-haze" />
    </div>
  );
}
