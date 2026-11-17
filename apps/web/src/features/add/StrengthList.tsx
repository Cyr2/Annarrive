import type { Strength } from "../../api/schemas.ts";
import { IconTile } from "../../ui/bits.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Group, Section } from "../../ui/List.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { TextButton } from "../../ui/TextButton.tsx";
import { useSheet } from "../sheets/store.ts";
import { strengthWhen } from "./add.ts";

type Props = { templates: Strength[]; onPlace: (template: Strength) => void };

/** Her saved strength sessions: tap to edit, "Placer" to put one in the week at its usual day and time. */
export function StrengthList({ templates, onPlace }: Props) {
  const show = useSheet((s) => s.show);
  return (
    <>
      <Section title="Tes séances de muscu">
        <Surface as="ul" variant="inset" className="m-0 flex list-none flex-col p-0">
          {templates.map((t) => (
            <li key={t.id} className="flex items-center gap-3 pl-4 [&+li]:border-t-[0.5px] [&+li]:border-hairline">
              <IconTile tone="strength" />
              <button
                type="button"
                onClick={() => show({ kind: "strength", templateId: t.id })}
                className="flex min-h-15 min-w-0 flex-1 flex-col justify-center gap-0.5 border-0 bg-transparent py-2 pr-1 text-left text-ink"
              >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="t-body break-words">{t.name}</span>
                  {t.legs && <LegsTag />}
                </span>
                <span className="t-cap">{strengthWhen(t)}</span>
              </button>
              <TextButton className="t-label mr-2 flex-none px-2 font-semibold" onClick={() => onPlace(t)}>
                Placer
              </TextButton>
            </li>
          ))}
        </Surface>
      </Section>
      <Group>
        <button
          type="button"
          onClick={() => show({ kind: "strength" })}
          className="press t-body flex min-h-13 items-center gap-3 border-0 bg-transparent px-4 text-action"
        >
          <Icon name="plus" size={20} stroke={2.25} />
          Nouvelle séance de muscu
        </button>
      </Group>
      <p className="t-cap m-0 px-4">
        Reggie organise tes courses autour de tes séances, avec 24 h d'écart après une séance jambes.
      </p>
    </>
  );
}

/**
 * "Jambes": a strength session that works the legs, which keeps hard runs and long runs 24 h away. Said in
 * words, in the strength tones, so it reads at a glance without looking like a warning.
 */
export function LegsTag() {
  return (
    <span className="t-cap inline-flex flex-none items-center gap-1 rounded-full bg-strength-wash px-2 py-0.5 font-semibold text-strength-deep">
      <Icon name="strength" size={13} stroke={2.4} />
      Jambes
    </span>
  );
}
