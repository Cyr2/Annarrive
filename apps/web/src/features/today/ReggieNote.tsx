import { Icon } from "../../ui/Icon.tsx";
import { ReggieAvatar } from "./parts.tsx";

/**
 * Reggie's word on today's session, in his green, and the way to him: the tap opens the conversation about this
 * session. It replaces a fourth round button: Reggie speaks first, and she answers if she wants.
 */
export function ReggieNote({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Parler à Reggie. ${text}`}
      data-variant="widget"
      className="surface press flex w-full items-center gap-3 border-0 py-3 pr-3 pl-4 text-left text-ink"
    >
      <ReggieAvatar />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="t-cap font-semibold text-reggie">Reggie</span>
        <span className="t-sub text-ink">{text}</span>
      </span>
      <Icon name="chevronRight" size={18} className="flex-none text-ink-3" />
    </button>
  );
}
