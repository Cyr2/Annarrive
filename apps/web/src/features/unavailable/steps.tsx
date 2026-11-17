import { cx } from "../../lib/cx.ts";
import { IconTile } from "../../ui/bits.tsx";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { Chip, SegmentedControl, Slider } from "../../ui/controls.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Group, RowInput, Section } from "../../ui/List.tsx";
import { PaceValue } from "../../ui/PaceValue.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { type Draft, painAdvice, REASONS, ZONES } from "./unavailable.ts";

type ReasonProps = { draft: Draft; today: string; onChange: (patch: Partial<Draft>) => void };

export function ReasonStep({ draft, today, onChange }: ReasonProps) {
  const lasting = draft.reason === "tired" || draft.reason === "pain";
  return (
    <>
      <ChoiceGroup label="Qu'est-ce qui se passe ?" className="flex flex-col gap-2">
        <h2 className="t-title m-0 px-1">Qu'est-ce qui se passe ?</h2>
        <Surface variant="inset" className="overflow-hidden">
          {REASONS.map((r) => {
            const on = draft.reason === r.value;
            return (
              <button
                key={r.value}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ reason: r.value })}
                className={cx(
                  "select-anim flex min-h-14 w-full items-center gap-3 border-0 px-4 text-left text-ink",
                  on ? "bg-action-wash" : "bg-transparent",
                )}
              >
                <IconTile tone="class" icon={r.icon} />
                <span className="flex flex-1 flex-col py-2">
                  <span className="t-body">{r.label}</span>
                  <span className="t-cap">{r.effect}</span>
                </span>
                <Icon name="check" size={18} stroke={2.6} className={cx("text-action", !on && "opacity-0")} />
              </button>
            );
          })}
        </Surface>
      </ChoiceGroup>
      {lasting && (
        <Section title="Combien de temps ?">
          <SegmentedControl
            label="Combien de temps ?"
            items={[
              { value: "today", label: "Juste aujourd'hui" },
              { value: "until", label: "Jusqu'à…" },
            ]}
            value={draft.untilOn ? "until" : "today"}
            onChange={(v) => onChange({ untilOn: v === "until" })}
          />
          {draft.untilOn && (
            <Group>
              <RowInput
                label="Jusqu'au"
                type="date"
                min={today}
                value={draft.until ?? ""}
                onChange={(until) => onChange({ until })}
              />
            </Group>
          )}
        </Section>
      )}
    </>
  );
}

export function FeverStep({ fever, onChange }: { fever?: boolean; onChange: (fever: boolean) => void }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="t-title m-0 px-1">Tu as de la fièvre ou ça touche la poitrine ?</h2>
      <SegmentedControl
        label="Fièvre ou poitrine"
        items={[
          { value: "yes", label: "Oui" },
          { value: "no", label: "Non" },
        ]}
        value={fever === undefined ? undefined : fever ? "yes" : "no"}
        onChange={(v) => onChange(v === "yes")}
      />
    </section>
  );
}

export function ZoneStep({ zone, onChange }: { zone?: string; onChange: (zone: string) => void }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="t-title m-0 px-1">Où ?</h2>
      <ChoiceGroup label="Où ?" className="flex flex-wrap gap-2">
        {ZONES.map((z) => (
          <Chip key={z} selected={zone === z} onClick={() => onChange(z)}>
            {z}
          </Chip>
        ))}
      </ChoiceGroup>
    </section>
  );
}

/** The pain level: the number in ink, a calm amber note from 4 up. Color never dramatizes it. */
export function PainStep({ pain, zone, onChange }: { pain: number; zone?: string; onChange: (pain: number) => void }) {
  return (
    <Surface variant="inset" className="flex flex-col gap-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor="pain" className="t-cap">
          {zone ? `${zone}, ` : ""}combien sur 10 en marchant ?
        </label>
        <PaceValue value={String(pain)} unit="/ 10" size="num" />
      </div>
      <Slider id="pain" value={pain} onChange={onChange} min={0} max={10} valueText={`${pain} sur 10`} />
      <div className="t-cap flex justify-between">
        <span>Aucune</span>
        <span>Très forte</span>
      </div>
      <p
        className={cx(
          "t-cap m-0 flex items-start gap-1.5 text-ink",
          pain >= 4 && "rounded-row bg-warn-wash px-3 py-2 text-warn-deep",
        )}
      >
        {pain >= 4 && <Icon name="info" size={16} className="mt-px flex-none" />}
        {painAdvice(pain)}
      </p>
    </Surface>
  );
}
