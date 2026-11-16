import type { UnavailableInput } from "../../api/client.ts";
import { ChangeRows } from "../reggie/ChangeRows.tsx";
import { useLoad } from "../useLoad.ts";

/** "Une carte résume ce qui change sur la semaine", fetched from the server before Valider. */
export function Summary({ input }: { input: UnavailableInput }) {
  const rows = useLoad((api) => api.previewUnavailable(input), JSON.stringify(input));
  return (
    <div className="flex flex-col gap-3 rounded-group bg-surface p-4">
      <span className="t-strong">Ce qui change</span>
      {rows === undefined && <span className="t-cap">Reggie prépare ta semaine…</span>}
      {rows === null && <span className="t-cap">Impossible de préparer le résumé. Réessaie dans un instant.</span>}
      {rows?.length === 0 && <span className="t-cap">Rien ne bouge dans ta semaine.</span>}
      {rows && rows.length > 0 && <ChangeRows rows={rows} />}
    </div>
  );
}
