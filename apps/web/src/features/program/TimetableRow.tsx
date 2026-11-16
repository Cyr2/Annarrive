import { useId, useState } from "react";
import type { Program } from "../../api/schemas.ts";
import { ago } from "../../lib/date.ts";
import { Button } from "../../ui/Button.tsx";
import { Dot } from "../../ui/bits.tsx";
import { usePlan } from "../plan/store.ts";
import { checkIcsUrl } from "./program.ts";

/** Connexions > Emploi du temps: last read, Actualiser, and the ICS link Anna pastes or changes. */
export function TimetableRow({ program }: { program: Program }) {
  const run = usePlan((s) => s.run);
  const id = useId();
  const saved = program.timetableUrl ?? "";
  const [url, setUrl] = useState(saved);
  const [error, setError] = useState<string>();
  const save = async () => {
    const checked = checkIcsUrl(url);
    const valid = checked.url;
    setError(checked.error);
    if (valid) await run((api) => api.setTimetableUrl(valid));
  };
  const checkedAt = program.timetableCheckedAt;
  return (
    <>
      <div className="row min-h-16">
        <span className="flex flex-col">
          <span className="t-body">Emploi du temps</span>
          <span className="t-cap flex items-center gap-1.5">
            <Dot size="md" className={checkedAt ? "bg-success" : "bg-danger"} />
            {checkedAt ? `À jour ${ago(checkedAt, new Date())}` : "Pas encore lu"}
          </span>
        </span>
        <Button variant="link" className="t-strong" onClick={() => void run((api) => api.refreshTimetable())}>
          Actualiser
        </Button>
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label htmlFor={id} className="t-body flex-none">
          Lien ICS
        </label>
        <input
          id={id}
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={url}
          placeholder="https://"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => setUrl(e.target.value)}
          className="t-body min-h-11 min-w-0 flex-1 border-0 bg-transparent text-right text-text-secondary"
        />
        <Button type="submit" variant="link" className="t-strong" disabled={url.trim() === saved}>
          Enregistrer
        </Button>
      </form>
      {error && (
        <p id={`${id}-error`} role="alert" className="t-cap row m-0 text-danger">
          {error}
        </p>
      )}
    </>
  );
}
