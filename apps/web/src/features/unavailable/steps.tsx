import { cx } from "../../lib/cx.ts";
import { IconTile } from "../../ui/bits.tsx";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Group, RowInput, Section } from "../../ui/List.tsx";
import { Segmented } from "../../ui/Segmented.tsx";
import { Slider } from "../../ui/Slider.tsx";
import { type Draft, painAdvice, REASONS, ZONES } from "./unavailable.ts";

type ReasonProps = { draft: Draft; today: string; onChange: (patch: Partial<Draft>) => void };

export function ReasonStep({ draft, today, onChange }: ReasonProps) {
  const lasting = draft.reason === "tired" || draft.reason === "pain";
  return (
    <>
      <ChoiceGroup label="Qu'est-ce qui se passe ?" className="flex flex-col gap-2">
        <h2 id="why-title" className="t-cap m-0 px-4">
          Qu'est-ce qui se passe ?
        </h2>
        <div className="group overflow-hidden">
          {REASONS.map((r) => {
            const on = draft.reason === r.value;
            return (
              <button
                key={r.value}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ reason: r.value })}
                className={cx(
                  "select-anim flex min-h-14 w-full items-center gap-3 border-0 px-4 text-left text-text",
                  on ? "bg-assistant-wash" : "bg-transparent",
                )}
              >
                <IconTile tone="class" icon={r.icon} />
                <span className="flex flex-1 flex-col py-2">
                  <span className="t-body">{r.label}</span>
                  <span className="t-cap">{r.effect}</span>
                </span>
                <Icon name="check" size={18} stroke={2.6} className={cx("text-assistant", !on && "opacity-0")} />
              </button>
            );
          })}
        </div>
      </ChoiceGroup>
      {lasting && (
        <Section title="Combien de temps ?">
          <Segmented
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
    <Section title="Tu as de la fièvre ou ça touche la poitrine ?">
      <Segmented
        size="md"
        label="Fièvre ou poitrine"
        items={[
          { value: "yes", label: "Oui" },
          { value: "no", label: "Non" },
        ]}
        value={fever === undefined ? undefined : fever ? "yes" : "no"}
        onChange={(v) => onChange(v === "yes")}
      />
    </Section>
  );
}

export function ZoneStep({ zone, onChange }: { zone?: string; onChange: (zone: string) => void }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 id="zone-title" className="t-cap m-0 px-4">
        Où ?
      </h2>
      <ChoiceGroup label="Où ?" className="flex flex-wrap gap-2">
        {ZONES.map((z) => (
          <button
            key={z}
            type="button"
            aria-pressed={zone === z}
            onClick={() => onChange(z)}
            className={cx(
              "select-anim press t-label min-h-11 rounded-full border-0 px-4",
              zone === z ? "bg-assistant text-on-accent" : "bg-surface text-text shadow-chip",
            )}
          >
            {z}
          </button>
        ))}
      </ChoiceGroup>
    </section>
  );
}

export function PainStep({ pain, zone, onChange }: { pain: number; zone?: string; onChange: (pain: number) => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-group bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <label htmlFor="pain" className="t-cap">
          {zone ? `${zone}, ` : ""}combien sur 10 en marchant ?
        </label>
        <span className={cx("t-num", pain <= 3 ? "text-easy-ink" : "text-intense-ink")}>
          {pain}
          <span className="t-sub"> / 10</span>
        </span>
      </div>
      <Slider id="pain" value={pain} onChange={onChange} min={0} max={10} valueText={`${pain} sur 10`} />
      <div className="t-cap flex justify-between">
        <span>Aucune</span>
        <span>Très forte</span>
      </div>
      <p className="t-cap m-0 text-text">{painAdvice(pain)}</p>
    </div>
  );
}
