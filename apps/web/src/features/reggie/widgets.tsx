import { useState } from "react";
import type { ProposedSlot, SessionPreview } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { relativeMoment } from "../../lib/date.ts";
import { tidy } from "../../lib/text.ts";
import { ChoiceCard } from "../../ui/ChoiceCard.tsx";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { Button, Chip, Slider } from "../../ui/controls.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { PaceValue } from "../../ui/PaceValue.tsx";
import { SessionChip } from "../../ui/SessionShape.tsx";
import { Surface } from "../../ui/Surface.tsx";

type Answer = { answer?: string; onAnswer: (answer: string) => void };

/** Reggie's widgets: mini cards of the app, edged in his green, rising 60 ms after his words. */
const card = "msg msg-widget flex w-full flex-col gap-3 self-start p-4";

/** 2 to 6 replies in his green, under his question. The one tapped stays, the others step back. */
export function Choices({ label, options, answer, onAnswer }: Answer & { label: string; options: string[] }) {
  return (
    <ChoiceGroup label={label} className="msg msg-widget flex w-[88%] flex-wrap gap-2 self-start">
      {options.map((option) => (
        <Chip
          key={option}
          tone="reggie"
          selected={answer === option}
          disabled={answer !== undefined}
          className={cx(answer !== undefined && answer !== option && "opacity-55")}
          onClick={() => onAnswer(option)}
        >
          {option}
        </Chip>
      ))}
    </ChoiceGroup>
  );
}

/** The 0 to 10 slider: drag, then Envoyer. Answered, it shows the level sent. */
export function Scale({ label, id, answer, onAnswer }: Answer & { label: string; id: string }) {
  const [value, setValue] = useState(3);
  return (
    <Surface variant="widget" className={card}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="t-sub">
          {label}
        </label>
        <PaceValue value={String(value)} unit="sur 10" size="num" rolling />
      </div>
      <Slider id={id} value={value} onChange={setValue} min={0} max={10} valueText={`${value} sur 10`} />
      <div className="t-cap flex justify-between">
        <span>Aucune</span>
        <span>Très forte</span>
      </div>
      <Button
        variant="tinted"
        tone="reggie"
        icon={answer ? "check" : undefined}
        disabled={answer !== undefined}
        onClick={() => onAnswer(`${value} sur 10`)}
      >
        {answer ? "Envoyé" : "Envoyer"}
      </Button>
    </Surface>
  );
}

/** Proposed slots; tapping one sends it, and the change card follows. */
export function Slots({ slots, today, answer, onAnswer }: Answer & { slots: ProposedSlot[]; today: string }) {
  return (
    <ChoiceGroup label="Créneaux proposés" className="msg msg-widget flex w-[88%] flex-col gap-2 self-start">
      {slots.map((slot) => {
        const label = relativeMoment(slot.date, slot.start, today);
        const on = answer?.toLowerCase() === label.toLowerCase();
        return (
          <ChoiceCard
            key={label}
            tone="reggie"
            on={on}
            disabled={answer !== undefined}
            onClick={() => onAnswer(label)}
            className="min-h-16 py-2.5"
          >
            <Icon name="clock" size={20} className={cx("flex-none", on ? "text-reggie" : "text-ink-2")} />
            <span className="flex flex-1 flex-col">
              <span className="t-strong">{label}</span>
              <span className="t-cap">{tidy(slot.why)}</span>
            </span>
          </ChoiceCard>
        );
      })}
    </ChoiceGroup>
  );
}

/** A replacement session as a mini session card, then "Prendre celle-ci" in his green or the alternative. */
export function Preview({
  session,
  alternative,
  answer,
  onAnswer,
}: Answer & { session: SessionPreview; alternative: string }) {
  return (
    <Surface variant="widget" className={card}>
      <div className="flex flex-col gap-1.5">
        <SessionChip tone={session.intensity} title={session.title} />
        <span className="t-title">{session.title}</span>
        <span className="t-sub">{tidy(session.detail)}</span>
      </div>
      <div className="flex flex-col gap-2">
        {["Prendre celle-ci", alternative].map((label, i) => (
          <Button
            key={label}
            variant={i === 0 ? "filled" : "glass"}
            tone={i === 0 ? "reggie" : undefined}
            icon={answer === label ? "check" : undefined}
            className={cx("w-full", answer !== undefined && answer !== label && "opacity-55")}
            disabled={answer !== undefined}
            onClick={() => onAnswer(label)}
          >
            {label}
          </Button>
        ))}
      </div>
    </Surface>
  );
}
