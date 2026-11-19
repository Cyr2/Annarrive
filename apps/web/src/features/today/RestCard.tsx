import type { Run } from "../../api/schemas.ts";
import { Icon } from "../../ui/Icon.tsx";
import { NextRun } from "./NextRun.tsx";
import { restLine } from "./today.ts";

/**
 * Rest day: no card at all. The moon, then the word and a calm sentence beside it, sit on the sky itself; the moon
 * rises once, and the next session waits below as a small card. The empty space is the rest.
 */
export function RestCard({ next, today }: { next?: Run; today: string }) {
  return (
    <>
      <article className="flex items-center gap-4 px-1 pt-6 pb-4">
        <span
          aria-hidden="true"
          data-variant="inset"
          className="surface rest-moon flex size-14 flex-none items-center justify-center rounded-full! text-ink-2"
        >
          <Icon name="moon" size={26} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="t-large">Repos</h1>
          <p className="t-body m-0 max-w-[30ch] text-ink-2">{restLine(today)}</p>
        </div>
      </article>
      {next && <NextRun run={next} today={today} label="Prochaine séance" />}
    </>
  );
}
