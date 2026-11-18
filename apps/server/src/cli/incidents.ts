import { parseArgs } from "node:util";
import { loadConfig } from "../config.ts";
import { formatIncident, IncidentService, sinceDate } from "../services/incidents.ts";
import { openDatabase } from "../storage/db.ts";
import { createStores } from "../storage/stores.ts";
import { systemClock } from "../time.ts";

const USAGE = `Journal des incidents d'Annarrivé (30 jours gardés) :
  incidents.ts                 les incidents des 7 derniers jours, du plus récent au plus ancien
  incidents.ts --since 2d      depuis 2 jours (aussi 12h, 30m)
  incidents.ts --id <id>       un seul incident
  incidents.ts --json          en JSON, à coller à un agent`;

const options = {
  since: { type: "string", default: "7d" },
  id: { type: "string" },
  json: { type: "boolean" },
} as const;
let args: ReturnType<typeof parseArgs<{ options: typeof options }>>["values"];
let since: Date;
try {
  args = parseArgs({ options }).values;
  since = sinceDate(args.since, new Date());
} catch (error) {
  console.error(`${error instanceof Error ? error.message : ""}\n${USAGE}`);
  process.exit(1);
}

const service = new IncidentService(createStores(openDatabase(loadConfig(process.env).DATA_DIR)), systemClock);
const found = args.id ? [service.get(args.id)].filter((i) => i !== undefined) : service.list(since);

if (args.json) console.info(JSON.stringify(found, null, 2));
else if (found.length === 0) console.info(args.id ? `Aucun incident ${args.id}.` : "Aucun incident sur cette période.");
else console.info(found.map(formatIncident).join("\n\n"));
