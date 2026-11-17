import { useState } from "react";
import type { ChangeResult, ProposedSlot, SessionPreview } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { relativeMoment } from "../../lib/date.ts";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { Button, Chip, Slider } from "../../ui/controls.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { PaceValue } from "../../ui/PaceValue.tsx";
import { SessionChip } from "../../ui/SessionShape.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { ChangeRows } from "./ChangeRows.tsx";

type Answer = { answer?: string; onAnswer: (answer: string) => void };

/** Reggie's widgets: mini cards of the app, edged in his green, under his bubble. */
const card = "msg msg-widget flex w-[84%] flex-col gap-3 self-start p-4";

/** 2 to 6 replies in his green, under his question. The one tapped stays, the others step back. */
export function Choices({ label, options, answer, onAnswer }: Answer & { label: string; options: string[] }) {
  return (
    <ChoiceGroup label={label} className="msg msg-widget flex w-[84%] flex-wrap gap-2 self-start">
      {options.map((option) => (
        <Chip
          key={option}
          tone="reggie"
          selected={answer === option}
          disabled={answer !== undefined}
          onClick={() => onAnswer(option)}
        >
          {option}
        </Chip>
      ))}
    </ChoiceGroup>
  );
}

/** The 0 to 10 slider: drag, then Envoyer. */
export function Scale({ label, id, answer, onAnswer }: Answer & { label: string; id: string }) {
  const [value, setValue] = useState(3);
  return (
    <Surface variant="widget" className={card}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="t-cap">
          {label}
        </label>
        <PaceValue value={String(value)} unit="/ 10" size="num" />
      </div>
      <Slider id={id} value={value} onChange={setValue} min={0} max={10} valueText={`${value} sur 10`} />
      <div className="t-cap flex justify-between">
        <span>Aucune</span>
        <span>Très forte</span>
      </div>
      <Button
        variant="tinted"
        tone="reggie"
        disabled={answer !== undefined}
        onClick={() => onAnswer(`${value} sur 10`)}
      >
        Envoyer
      </Button>
    </Surface>
  );
}

/** Three proposed slots; tapping one sends it, and the change card follows. */
export function Slots({ slots, today, answer, onAnswer }: Answer & { slots: ProposedSlot[]; today: string }) {
  return (
    <ChoiceGroup label="Créneaux proposés" className="msg msg-widget flex w-[84%] flex-col gap-2 self-start">
      {slots.map((slot) => {
        const label = relativeMoment(slot.date, slot.start, today);
        const on = answer?.toLowerCase() === label.toLowerCase();
        return (
          <button
            key={label}
            type="button"
            disabled={answer !== undefined}
            onClick={() => onAnswer(label)}
            data-variant="inset"
            className={cx(
              "surface select-anim press flex min-h-16 items-center gap-3 border-0 px-4 py-2 text-left text-ink",
              on && "bg-reggie-wash shadow-[inset_0_0_0_2px_var(--color-reggie)]",
              answer !== undefined && !on && "opacity-55",
            )}
          >
            <span className="flex flex-1 flex-col">
              <span className="t-strong">{label}</span>
              <span className="t-cap">{slot.why}</span>
            </span>
            {on && <Icon name="check" size={18} stroke={2.6} className="text-reggie" />}
          </button>
        );
      })}
    </ChoiceGroup>
  );
}

/** A replacement session: "Prendre celle-ci" in his green, or the alternative. Stacked, so neither label breaks. */
export function Preview({
  session,
  alternative,
  answer,
  onAnswer,
}: Answer & { session: SessionPreview; alternative: string }) {
  return (
    <Surface variant="widget" className={card}>
      <div className="flex flex-col gap-1.5">
        <SessionChip tone={session.intensity}>{session.title}</SessionChip>
        <span className="t-body">{session.detail}</span>
      </div>
      {["Prendre celle-ci", alternative].map((label, i) => (
        <Button
          key={label}
          variant={i === 0 ? "filled" : "glass"}
          tone={i === 0 ? "reggie" : undefined}
          className={cx("w-full", answer !== undefined && answer !== label && "opacity-55")}
          disabled={answer !== undefined}
          onClick={() => onAnswer(label)}
        >
          {label}
        </Button>
      ))}
    </Surface>
  );
}

/** After any change: the week day by day, watch updated, Annuler until the next change. */
export function ChangeCard({
  change,
  canUndo,
  onUndo,
}: {
  change: ChangeResult;
  canUndo: boolean;
  onUndo: () => void;
}) {
  return (
    <Surface variant="widget" className={card}>
      <span className="t-strong">J'ai modifié ta semaine</span>
      {change.rows.length > 0 && <ChangeRows rows={change.rows} />}
      <div className="flex items-center justify-between gap-2">
        <span className="t-cap flex items-center gap-1.5">
          <Icon name="watch" size={16} />
          Montre mise à jour
        </span>
        <Button variant="tinted" disabled={!canUndo} onClick={onUndo}>
          Annuler
        </Button>
      </div>
    </Surface>
  );
}
