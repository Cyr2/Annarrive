import type { ChatContext } from "@annarrive/protocol";
import { Icon } from "../../ui/Icon.tsx";
import { TextButton } from "../../ui/TextButton.tsx";
import { useGo } from "../useGo.ts";
import { useChat } from "./store.ts";

type Props = {
  /** What Reggie is told the talk is about: the goal, the session with its steps. */
  context: string;
  about: ChatContext;
  /** Sent for her, so Reggie answers at once. */
  question: string;
  /** Closes what the link sits in (a popover) before the app moves to Reggie. */
  onGo?: () => void;
  className?: string;
};

/** « En parler avec Reggie », under every explanation: opens Reggie on that subject and asks the question for her. */
export function TalkLink({ context, about, question, onGo, className }: Props) {
  const go = useGo();
  const talk = () => {
    onGo?.();
    const chat = useChat.getState();
    chat.setContext(context, about);
    // Today's history first: read after the question, it would show it twice.
    void chat.loadHistory().then(() => chat.send(question));
    go("/reggie");
  };
  return (
    <TextButton className={className ?? "-ml-1 self-start text-left"} onClick={talk}>
      En parler avec Reggie
      <Icon name="chevronRight" size={14} stroke={2.5} />
    </TextButton>
  );
}
