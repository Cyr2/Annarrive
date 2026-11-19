import type { Week } from "../../api/schemas.ts";
import { SectionTitle } from "../../ui/List.tsx";
import { WeekStrip } from "../../ui/WeekStrip.tsx";
import { useGo } from "../useGo.ts";
import { stripOf, weekDays } from "../week/week.ts";

/** "Cette semaine": the strip of the week; a day opens Semaine on that day. */
export function ThisWeek({ week, today }: { week: Week; today: string }) {
  const go = useGo();
  const days = stripOf(weekDays(week, today), (day) => `/semaine?jour=${day.date}`);
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <SectionTitle>Cette semaine</SectionTitle>
        <a
          href="/semaine"
          onClick={(e) => {
            e.preventDefault();
            go("/semaine");
          }}
          className="t-body inline-flex min-h-11 items-center text-action-deep"
        >
          Tout voir
        </a>
      </div>
      <WeekStrip days={days} label="Cette semaine" onSelect={(day) => go(day.href)} />
    </section>
  );
}
