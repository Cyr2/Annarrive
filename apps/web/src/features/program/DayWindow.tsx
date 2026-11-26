import { minutesOf, timeOf } from "../../lib/date.ts";
import { Icon } from "../../ui/Icon.tsx";

const FROM = 5 * 60;
const TO = 24 * 60;
const TICKS = ["6:00", "12:00", "18:00", "24:00"];
/** Runs end at least this long before bedtime. */
const BEFORE_BED = 60;

const at = (minutes: number) => `${((Math.min(Math.max(minutes, FROM), TO) - FROM) / (TO - FROM)) * 100}%`;
/** A bedtime after midnight ("0:30") belongs to the same evening. */
const evening = (time: string) => (minutesOf(time) < 12 * 60 ? minutesOf(time) + 24 * 60 : minutesOf(time));

/** When her runs can actually happen: from "pas avant" to "pas après", cut one hour before bedtime. */
export function runWindow(notBefore: string, notAfter: string, bedtime: string) {
  const start = minutesOf(notBefore);
  // « Pas après 0:00 » is midnight, the end of the day.
  const end = Math.min(minutesOf(notAfter) || TO, evening(bedtime) - BEFORE_BED);
  const until = end === TO ? "minuit" : timeOf(end);
  return { start, end, text: end > start ? `${timeOf(start)} à ${until}` : "Aucun créneau" };
}

/**
 * Her day from 5:00 to midnight: the window where runs go, in the selection blue, and bedtime marked with the
 * moon. It moves as she changes a time, so the three settings read as one picture.
 */
export function DayWindow({ notBefore, notAfter, bedtime }: { notBefore: string; notAfter: string; bedtime: string }) {
  const slot = runWindow(notBefore, notAfter, bedtime);
  const bed = evening(bedtime);
  return (
    <figure className="row my-0 mr-0 flex-col items-stretch gap-2 py-3">
      <figcaption className="t-sub flex justify-between gap-2">
        <span>Tu peux courir</span>
        <span className="font-semibold text-ink tabular-nums">{slot.text}</span>
      </figcaption>
      <div aria-hidden="true" className="relative mt-5 h-3 rounded-full bg-fill">
        {slot.end > slot.start && (
          <span
            className="select-anim absolute inset-y-0 rounded-full bg-action-wash shadow-ring"
            style={{ left: at(slot.start), right: `calc(100% - ${at(slot.end)})` }}
          />
        )}
        <span
          className="select-anim absolute -top-5 flex -translate-x-1/2 flex-col items-center text-ink-2"
          style={{ left: at(bed) }}
        >
          <Icon name="moon" size={14} stroke={2.25} />
          <span className="mt-0.5 h-6 w-px bg-hairline-strong" />
        </span>
      </div>
      <div aria-hidden="true" className="t-cap relative h-4 tabular-nums">
        {TICKS.map((t) => (
          <span key={t} className="absolute -translate-x-1/2 last:-translate-x-full" style={{ left: at(minutesOf(t)) }}>
            {t}
          </span>
        ))}
      </div>
    </figure>
  );
}
