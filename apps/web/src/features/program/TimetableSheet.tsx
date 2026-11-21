import { useId, useState } from "react";
import { Button } from "../../ui/controls.tsx";
import { Group } from "../../ui/List.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { usePlan } from "../plan/store.ts";
import type { SheetProps } from "../sheets/SheetHost.tsx";
import { checkIcsUrl } from "./program.ts";

/** The timetable link (ICS) in a sheet: a full-width field, checked when she saves, the error under it. */
export default function TimetableSheet(sheet: SheetProps<"timetable">) {
  const saved = usePlan((s) => s.program?.timetableUrl) ?? "";
  const run = usePlan((s) => s.run);
  const id = useId();
  const [url, setUrl] = useState(saved);
  const [error, setError] = useState<string>();
  const save = async () => {
    const checked = checkIcsUrl(url);
    setError(checked.error);
    const valid = checked.url;
    if (valid && (await run((api) => api.setTimetableUrl(valid)))) sheet.onOpenChange(false);
  };
  return (
    <Sheet
      {...sheet}
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
          <span className="sr-only-label">Lien de ton emploi du temps</span>
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
