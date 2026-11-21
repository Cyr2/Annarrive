import { useEffect } from "react";
import { cx } from "../../lib/cx.ts";
import { Icon } from "../../ui/Icon.tsx";
import { SectionTitle } from "../../ui/List.tsx";
import { Skeleton } from "../../ui/Skeleton.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { usePlan } from "../plan/store.ts";
import { useSheet } from "../sheets/store.ts";
import {
  bars,
  currentWeek,
  type Data,
  keptLine,
  raceDay,
  raceName,
  shortTime,
  summary,
  type Trajectory,
  trajectory,
  weekLine,
} from "./progression.ts";
import { useProgression } from "./store.ts";

/** Room for the curve's dots and its line ends above and below the times it shows, in % of the chart's height. */
const EDGE = 8;
const top = (y: number) => EDGE + (1 - y) * (100 - 2 * EDGE);
const pct = (x: number) => `${x * 100}%`;

/** PR1: her past weeks in a solid line, today a blue dot, then dots towards her target on race day. */
function Curve({ t, d }: { t: Trajectory; d: Data }) {
  const now = t.points.at(-1);
  if (!now) return null;
  const line = t.points.map((p) => `${p.x * 100},${top(p.y)}`).join(" ");
  const nowX = now.x * 100;
  return (
    <div aria-hidden="true" className="flex flex-col gap-1">
      <div className="relative h-[132px]">
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
        >
          <defs>
            <linearGradient id="progression-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--color-action)" stopOpacity="0.16" />
              <stop offset="1" stopColor="var(--color-action)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {t.target && (
            <line
              x1="0"
              x2="100"
              y1={top(t.target.y)}
              y2={top(t.target.y)}
              stroke="var(--color-ok)"
              strokeWidth="1.5"
              strokeDasharray="2 5"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <polygon points={`${(t.points[0]?.x ?? 0) * 100},100 ${line} ${nowX},100`} fill="url(#progression-area)" />
          <line
            x1={nowX}
            x2={nowX}
            y1={top(now.y)}
            y2="100"
            stroke="var(--color-action)"
            strokeOpacity="0.5"
            strokeWidth="1.5"
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={line}
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {t.target && (
            <line
              x1={nowX}
              y1={top(now.y)}
              x2="100"
              y2={top(t.target.y)}
              stroke="var(--color-ink-2)"
              strokeWidth="2"
              strokeDasharray="1 6"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {t.points.slice(0, -1).map((p) => (
          <span
            key={p.x}
            className="absolute size-2 -translate-1/2 rounded-full bg-ink"
            style={{ left: pct(p.x), top: `${top(p.y)}%` }}
          />
        ))}
        <span
          className="absolute size-3.5 -translate-1/2 rounded-full bg-action shadow-glow-action ring-3 ring-on-color"
          style={{ left: pct(now.x), top: `${top(now.y)}%` }}
        />
        {t.target && (
          <span
            className="t-cap absolute right-0 -translate-y-full pb-1 font-semibold text-ok-deep tabular-nums"
            style={{ top: `${top(t.target.y)}%` }}
          >
            {shortTime(t.target.min)}
          </span>
        )}
      </div>
      <div className="t-cap relative h-[18px]">
        {nowX > 18 && <span className="absolute left-0">S1</span>}
        <span
          className="absolute font-semibold whitespace-nowrap text-action-deep"
          style={{ left: `${Math.min(Math.max(nowX, 14), 78)}%`, transform: "translateX(-50%)" }}
        >
          Aujourd'hui
        </span>
        {nowX < 62 && <span className="absolute right-0">{raceDay(d)}</span>}
      </div>
    </div>
  );
}

/** PR2: what she ran each week over what was planned, the current week's number in blue. */
function Bars({ d, today }: { d: Data; today: string }) {
  const now = currentWeek(d, today);
  const last = d.weeks.length - 1;
  return (
    <div aria-hidden="true" className="flex flex-col gap-1">
      <div className="flex h-24 items-end gap-1">
        {bars(d).map((b, i) => (
          <div key={b.monday} className="relative h-full flex-1">
            {b.planned > 0 && (
              <span
                className="absolute inset-x-0 bottom-0 min-h-1.5 rounded-full bg-fill shadow-[inset_0_0_0_1px_var(--color-hairline-strong)]"
                style={{ height: pct(b.planned) }}
              />
            )}
            {b.done > 0 && (
              <span
                className={cx(
                  "absolute inset-x-0 bottom-0 min-h-1.5 rounded-full",
                  "bg-[linear-gradient(to_bottom,var(--color-long),var(--color-long-wash))]",
                  i === now && "shadow-[0_0_0_1.5px_var(--color-on-color)]",
                )}
                style={{ height: pct(b.done) }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        {d.weeks.map((w, i) => {
          const shown = i === now || ((i === 0 || i === last) && Math.abs(i - now) > 1);
          return (
            <span
              key={w.monday}
              className={cx("t-tab flex-1 text-center tabular-nums", i === now ? "text-action-deep" : "text-ink-2")}
            >
              {shown ? i + 1 : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div aria-hidden="true" className="t-cap flex gap-4">
      <span className="inline-flex items-center gap-1.5">
        <i className="size-2.5 rounded-[3px] bg-[linear-gradient(to_bottom,var(--color-long),var(--color-long-wash))]" />
        Fait
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className="size-2.5 rounded-[3px] bg-fill shadow-[inset_0_0_0_1px_var(--color-hairline-strong)]" />
        Prévu
      </span>
    </div>
  );
}

function Card({ d, today }: { d: Data; today: string }) {
  const show = useSheet((s) => s.show);
  const curve = trajectory(d, today);
  const kept = keptLine(d);
  return (
    <Surface as="article" aria-labelledby="progression-title" className="relative flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <span className="t-sub">{raceName(d)} estimé aujourd'hui</span>
          <span className="flex flex-wrap items-baseline gap-x-2.5">
            <span className="t-figure tabular-nums">{shortTime(d.currentMin)}</span>
            {d.targetMin && <span className="t-body text-ink-2 tabular-nums">objectif {shortTime(d.targetMin)}</span>}
          </span>
        </div>
        {/* The whole card opens the detail: the button's box is stretched over it. */}
        <button
          type="button"
          aria-label="Voir le détail de ta progression"
          onClick={() => show({ kind: "progression" })}
          className="mt-1 flex size-11 flex-none items-start justify-end bg-transparent p-0 text-ink-3 before:absolute before:inset-0 before:rounded-[inherit] active:before:bg-fill"
        >
          <Icon name="chevronRight" size={16} stroke={2.5} />
        </button>
      </div>
      <p className="sr-only-label">{summary(d, today)}</p>
      {curve ? (
        <Curve t={curve} d={d} />
      ) : (
        <p className="t-sub m-0 flex h-[154px] items-center justify-center rounded-row bg-fill px-6 text-center">
          Ta courbe se dessine après ta première semaine.
        </p>
      )}
      <div className="hairline-top flex flex-col gap-3 pt-4">
        <div className="flex flex-col">
          <span className="t-strong">Temps de course par semaine</span>
          <span className="t-sub tabular-nums">{weekLine(d, today)}</span>
        </div>
        <Bars d={d} today={today} />
        <Legend />
      </div>
      <p className="hairline-top m-0 flex flex-col pt-4">
        <span className="t-strong tabular-nums">{kept.figure}</span>
        <span className="t-sub">{kept.rest}</span>
      </p>
    </Surface>
  );
}

/** Programme's Progression (design: validation/weekend §5): where she stands, what she ran, what she kept. */
export function ProgressionCard() {
  const program = usePlan((s) => s.program);
  const today = usePlan((s) => s.today?.date);
  const data = useProgression((s) => s.data);
  // A new programme, a new chrono, an accepted level: the block follows each reload of the programme.
  useEffect(() => {
    if (program && !program.maintenance) void useProgression.getState().load();
  }, [program]);
  if (!program || program.maintenance || data === null) return null;
  return (
    <section aria-labelledby="progression-title" className="flex flex-col gap-2">
      <SectionTitle id="progression-title">Progression</SectionTitle>
      {data && today ? (
        <Card d={data} today={today} />
      ) : (
        <Skeleton label="Chargement de ta progression" className="h-[579px]" />
      )}
    </section>
  );
}
