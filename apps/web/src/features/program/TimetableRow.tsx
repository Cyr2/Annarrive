import { useId, useState } from "react";
import type { Program } from "../../api/schemas.ts";
import { Dot } from "../../ui/bits.tsx";
import { Button } from "../../ui/controls.tsx";
import { Group, RowButton } from "../../ui/List.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { usePlan } from "../plan/store.ts";
import { checkedLine, useTimetableRefresh } from "../week/RefreshRow.tsx";
import { checkIcsUrl } from "./program.ts";

/** "ent.univ.fr": enough to recognize the link without reading it whole. */
const host = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** The ICS link in a sheet: a full-width field, checked when she saves, the error under it. */
function LinkSheet({
  saved,
  open,
  onOpenChange,
}: {
  saved: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const run = usePlan((s) => s.run);
  const busy = usePlan((s) => s.busy);
  const id = useId();
  const [url, setUrl] = useState(saved);
  const [error, setError] = useState<string>();
  const save = async () => {
    const checked = checkIcsUrl(url);
    setError(checked.error);
    const valid = checked.url;
    if (valid && (await run((api) => api.setTimetableUrl(valid)))) onOpenChange(false);
  };
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title="Emploi du temps"
      footer={
        <Button
          variant="filled"
          size="large"
          disabled={!url.trim() || url.trim() === saved}
          onClick={() => void save()}
        >
          Enregistrer
        </Button>
      }
    >
      <Group>
        <label htmlFor={id} className="row field-ring">
          <span className="sr-only-label">Lien ICS</span>
          <input
            id={id}
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={url}
            placeholder="Ex. : https://ent.univ.fr/agenda.ics"
            aria-invalid={Boolean(error)}
            aria-describedby={`${id}-help`}
            onChange={(e) => setUrl(e.target.value)}
            className="t-body min-h-11 w-full min-w-0 truncate border-0 bg-transparent text-left text-ink outline-none placeholder:text-ink-3"
          />
        </label>
      </Group>
      <p
        id={`${id}-help`}
        role={error ? "alert" : undefined}
        className={error ? "t-cap m-0 px-4 text-warn-deep" : "t-cap m-0 px-4"}
      >
        {error ?? "Dans ton ENT, copie le lien d'abonnement au calendrier (ICS ou webcal) et colle-le ici."}
      </p>
    </Sheet>
  );
}

/** Emploi du temps: when it was last read with Actualiser, and the link she pasted. */
export function TimetableRows({ program }: { program: Program }) {
  const [open, setOpen] = useState(false);
  const { reading, result, button } = useTimetableRefresh();
  const saved = program.timetableUrl ?? "";
  const checkedAt = program.timetableCheckedAt;
  const line = reading ? "Lecture en cours…" : (result ?? checkedLine(checkedAt, "Pas encore lu"));
  return (
    <>
      <div className="row min-h-16">
        <span className="flex min-w-0 flex-col">
          <span className="t-body">Dernière lecture</span>
          <span role="status" className="t-cap flex items-center gap-1.5">
            <Dot size="md" className={checkedAt || result ? "bg-ok" : "bg-warn"} />
            {line}
          </span>
        </span>
        {button}
      </div>
      <RowButton
        label="Lien ICS"
        // A link it cannot read stays on one line, cut short: never a long string across the row.
        value={saved ? <span className="block truncate">{host(saved)}</span> : "Ajouter"}
        onClick={() => setOpen(true)}
      />
      <LinkSheet key={saved} saved={saved} open={open} onOpenChange={setOpen} />
    </>
  );
}
