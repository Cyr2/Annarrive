/** Where the programme stands: the light climbs and warms from base to race week. */
export type SkyPhase = "base" | "build" | "peak" | "race";

/**
 * « Ciel du matin »: the one backdrop behind the whole app, fixed, under every screen, sheet and onboarding.
 * A warm dawn gradient with its sun, a coral haze and two pale cool fields (styles/surfaces.css). It never moves, so the glass over it stays cheap to blur.
 */
export function Sky({ phase = "base" }: { phase?: SkyPhase }) {
  return (
    <div aria-hidden="true" className="sky" data-phase={phase}>
      <div className="sky-sun" />
      <div className="sky-haze" />
    </div>
  );
}
