import { Icon } from "../../ui/Icon.tsx";
import { ReggieAvatar } from "./parts.tsx";

/**
 * Reggie's word on today's session, and the way to him: a glass row with his face, his name in green, the one-line
 * why and a chevron. The tap opens the conversation about this session.
 */
export function ReggieNote({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-variant="inset"
      className="surface press flex min-h-16 w-full items-center gap-3 border-0 py-3 pr-3 pl-3.5 text-left text-ink"
    >
      <ReggieAvatar size="md" />
      {/* Its name is its visible text, "Reggie" then his word, so voice control finds it by what it shows. */}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="t-cap font-semibold text-reggie">
          <span className="sr-only-label">Parler à </span>Reggie
        </span>{" "}
        <span className="t-sub text-ink">{text}</span>
      </span>
      <Icon name="chevronRight" size={18} className="flex-none text-ink-3" />
    </button>
  );
}
