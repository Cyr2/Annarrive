import { Chip } from "../../ui/controls.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { usePlan } from "../plan/store.ts";
import { ChangeCard } from "./ChangeCard.tsx";
import { type Entry, useChat } from "./store.ts";
import { Choices, Preview, Scale, Slots } from "./widgets.tsx";

/** French typography: a no-break space keeps "?", "!", ":" and ";" with the word before them. */
export function frenchSpaces(text: string): string {
  return text.replace(/ ([?!:;])/g, " $1");
}

/** One message: hers in the action blue on the right, Reggie's on a surface edged in his green on the left, then his widget 60 ms later. */
export function Message({ entry, today }: { entry: Entry; today: string }) {
  return (
    <>
      {entry.text && (entry.role === "user" ? <UserBubble text={entry.text} /> : <ReggieBubble entry={entry} />)}
      {entry.widget && <Widget entry={entry} today={today} />}
    </>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="msg bubble-user t-body max-w-[78%] self-end bg-action px-4 py-3 text-on-color">
      {frenchSpaces(text)}
    </div>
  );
}

function ReggieBubble({ entry }: { entry: Entry }) {
  const busy = useChat((s) => s.status !== "idle");
  return (
    <Surface variant="widget" className="msg bubble-reggie t-body flex max-w-[84%] flex-col gap-2 self-start px-4 py-3">
      <span>{frenchSpaces(entry.text)}</span>
      {entry.source && (
        <a
          href={entry.source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="t-cap hairline-top -mx-1 flex min-h-11 items-center gap-1.5 px-1 pt-2 font-semibold text-action"
        >
          <Icon name="info" size={16} className="flex-none" />
          <span className="min-w-0">Source : {entry.source.label}</span>
        </a>
      )}
      {entry.retry && (
        <Chip
          icon="change"
          disabled={busy}
          className="self-start"
          onClick={() => void useChat.getState().retry(entry.id)}
        >
          Réessayer
        </Chip>
      )}
    </Surface>
  );
}

function Widget({ entry, today }: { entry: Entry; today: string }) {
  const answer = useChat((s) => s.answer);
  const lastChangeId = usePlan((s) => s.lastChangeId);
  const widget = entry.widget;
  const onAnswer = (value: string) => void answer(entry.id, value);
  const answered = entry.answer;
  switch (widget?.type) {
    case "choices":
      return <Choices label={widget.label} options={widget.options} answer={answered} onAnswer={onAnswer} />;
    case "scale":
      return <Scale id={`scale-${entry.id}`} label={widget.label} answer={answered} onAnswer={onAnswer} />;
    case "slots":
      return <Slots slots={widget.slots} today={today} answer={answered} onAnswer={onAnswer} />;
    case "preview":
      return (
        <Preview session={widget.session} alternative={widget.alternative} answer={answered} onAnswer={onAnswer} />
      );
    case "change": {
      const undo = async () => {
        await usePlan.getState().undo(widget.change.changeId);
        // A failed undo keeps the change as the latest one: the card stays as it was, with its button.
        if (usePlan.getState().lastChangeId !== widget.change.changeId) useChat.getState().undone(entry.id);
      };
      const state = answered === "undone" ? "undone" : lastChangeId === widget.change.changeId ? "live" : "superseded";
      return <ChangeCard change={widget.change} state={state} onUndo={() => void undo()} />;
    }
    default:
      return null;
  }
}
