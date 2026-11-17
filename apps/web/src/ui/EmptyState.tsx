import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon.tsx";
import { Surface } from "./Surface.tsx";

type Props = { icon: IconName; title: string; children?: ReactNode; action?: ReactNode };

/** Nothing to show, or something went wrong: an icon, one sentence, and always a way forward. */
export function EmptyState({ icon, title, children, action }: Props) {
  return (
    <Surface className="flex flex-col items-center gap-3 px-6 py-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-action-wash text-action">
        <Icon name={icon} />
      </span>
      <h2 className="t-title">{title}</h2>
      {children && <p className="t-sub m-0 max-w-[32ch]">{children}</p>}
      {action}
    </Surface>
  );
}
