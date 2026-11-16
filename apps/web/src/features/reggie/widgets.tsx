import { useState } from "react";
import type { ChangeResult, ProposedSlot, SessionPreview } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { relativeMoment } from "../../lib/date.ts";
import { Button } from "../../ui/Button.tsx";
import { IconTile } from "../../ui/bits.tsx";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Slider } from "../../ui/Slider.tsx";
import { TONES } from "../../ui/tones.ts";
import { ChangeRows } from "./ChangeRows.tsx";

type Answer = { answer?: string; onAnswer: (answer: string) => void };

const card = "msg msg-widget flex w-[84%] flex-col gap-3 self-start rounded-group bg-surface p-4";

/** 2 to 6 reply buttons. The one tapped fills, the others fade and stop answering. */
export function Choices({ label, options, answer, onAnswer }: Answer & { label: string; options: string[] }) {
  return (
    <ChoiceGroup label={label} className="msg msg-widget flex flex-wrap gap-2">
      {options.map((option) => {
        const on = answer === option;
        return (
          <button
            key={option}
            type="button"
            disabled={answer !== undefined}
            aria-pressed={on}
            onClick={() => onAnswer(option)}
            className={cx(
              "select-anim press t-label min-h-11 rounded-full border-0 px-4",
              on ? "bg-assistant text-on-accent" : "bg-surface text-text shadow-chip",
              answer !== undefined && !on && "opacity-55",
            )}
          >
            {option}
          </button>
        );
      })}
    </ChoiceGroup>
  );
}

/** The 0 to 10 slider: drag, then Envoyer. */
export function Scale({ label, id, answer, onAnswer }: Answer & { label: string; id: string }) {
  const [value, setValue] = useState(3);
  const low = value <= 3;
  return (
    <div className={card}>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="t-cap">
          {label}
        </label>
        <span className={cx("t-num", low ? "text-easy-ink" : "text-intense-ink")}>
          {value}
          <span className="t-sub"> / 10</span>
        </span>
      </div>
      <Slider id={id} value={value} onChange={setValue} min={0} max={10} valueText={`${value} sur 10`} />
      <div className="t-cap flex justify-between">
        <span>Aucune</span>
        <span>Très forte</span>
      </div>
      <Button variant="tintedBlue" disabled={answer !== undefined} onClick={() => onAnswer(`${value} sur 10`)}>
        Envoyer
      </Button>
    </div>
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
            className={cx(
              "select-anim press flex min-h-16 flex-col justify-center rounded-row border-0 bg-surface px-4 py-2 text-left text-text",
              on && "shadow-ring",
              answer !== undefined && !on && "opacity-55",
            )}
          >
            <span className="t-strong">{label}</span>
            <span className="t-cap">{slot.why}</span>
          </button>
        );
      })}
    </ChoiceGroup>
  );
}

/** A replacement session: "Prendre celle-ci" or the alternative. */
export function Preview({
  session,
  alternative,
  answer,
  onAnswer,
}: Answer & { session: SessionPreview; alternative: string }) {
  const tone = TONES[session.intensity];
  return (
    <div className={card}>
      <div className={cx("flex items-center gap-3 rounded-row p-3", tone.wash)}>
        <IconTile tone={session.intensity} />
        <span className="flex flex-1 flex-col">
          <span className={cx("t-strong", tone.deep)}>{session.title}</span>
          <span className={cx("t-cap", tone.ink)}>{session.detail}</span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {["Prendre celle-ci", alternative].map((label, i) => (
          <Button
            key={label}
            variant={i === 0 ? "primary" : "tinted"}
            className={cx("min-h-11", answer !== undefined && answer !== label && "opacity-55")}
            disabled={answer !== undefined}
            onClick={() => onAnswer(label)}
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** After any change: before and after by day, watch updated, Annuler until the next change. */
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
    <div className={card}>
      <span className="t-strong">J'ai modifié ta semaine</span>
      {change.rows.length > 0 && <ChangeRows rows={change.rows} />}
      <div className="flex items-center justify-between">
        <span className="t-cap flex items-center gap-1.5">
          <Icon name="watch" size={16} />
          Montre mise à jour
        </span>
        <Button variant="tinted" disabled={!canUndo} onClick={onUndo}>
          Annuler
        </Button>
      </div>
    </div>
  );
}
