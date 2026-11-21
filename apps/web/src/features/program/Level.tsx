import type { Program } from "../../api/schemas.ts";
import { IconTile } from "../../ui/bits.tsx";
import { Group, RowButton } from "../../ui/List.tsx";
import { useSheet } from "../sheets/store.ts";
import { lastRaceLine } from "./program.ts";

/** Her last race, which sets her paces: she changes it here. */
export function LastRace({ program, today }: { program: Program; today: string }) {
  const show = useSheet((s) => s.show);
  const last = program.lastTime;
  return (
    <Group>
      <RowButton
        label={
          <span className="flex flex-col">
            <span className="t-body">Ta dernière course</span>
            <span className="t-sub">{last ? lastRaceLine(last, today) : "Pas encore renseignée"}</span>
          </span>
        }
        onClick={() => show({ kind: "lastTime" })}
      />
    </Group>
  );
}

/** The last row of Programme: Réglages, pushed over it. */
export function SettingsRow({ onOpen }: { onOpen: () => void }) {
  return (
    <Group>
      <RowButton
        label={
          <span className="flex items-center gap-3">
            <IconTile tone="other" icon="settings" />
            Réglages
          </span>
        }
        onClick={onOpen}
      />
    </Group>
  );
}
