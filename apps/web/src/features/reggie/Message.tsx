import { Surface } from "../../ui/Surface.tsx";
import { usePlan } from "../plan/store.ts";
import { type Entry, useChat } from "./store.ts";
import { ChangeCard, Choices, Preview, Scale, Slots } from "./widgets.tsx";

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
  return <div className="msg bubble-user t-body max-w-[78%] self-end bg-action px-4 py-3 text-on-color">{text}</div>;
}

function ReggieBubble({ entry }: { entry: Entry }) {
  return (
    <Surface variant="widget" className="msg bubble-reggie t-body flex max-w-[84%] flex-col gap-2 self-start px-4 py-3">
      <span>{entry.text}</span>
      {entry.source && (
        <a href={entry.source.url} target="_blank" rel="noopener noreferrer" className="t-cap text-action underline">
          Source : {entry.source.label}
        </a>
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
        useChat.getState().undone(entry.id);
      };
      return (
        <ChangeCard
          change={widget.change}
          canUndo={answered !== "undone" && lastChangeId === widget.change.changeId}
          onUndo={() => void undo()}
        />
      );
    }
    default:
      return null;
  }
}
