import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";
import { localDateSchema } from "@annarrive/protocol";
import { loadConfig } from "../config.ts";
import { weekReport } from "../services/report.ts";
import { createStores } from "../storage/stores.ts";
import { addDays, dateOf, systemClock, toParisLocal } from "../time.ts";

const USAGE = `Rapport de la semaine d'Anna (lecture seule) :
  rapport.ts                           les 7 derniers jours, aujourd'hui compris
  rapport.ts --depuis 2026-11-22       du 22 novembre à aujourd'hui
  rapport.ts --depuis 2026-11-22 --jusqua 2026-11-29`;

const now = toParisLocal(systemClock());
let range: { from: string; to: string };
try {
  const { values } = parseArgs({ options: { depuis: { type: "string" }, jusqua: { type: "string" } } });
  const to = localDateSchema.parse(values.jusqua ?? dateOf(now));
  range = { from: localDateSchema.parse(values.depuis ?? addDays(to, -6)), to };
} catch {
  console.error(USAGE);
  process.exit(1);
}

// Opened read-only, never through openDatabase: nothing is migrated or written in the live file.
const db = new DatabaseSync(join(loadConfig(process.env).DATA_DIR, "annarrive.db"), { readOnly: true });
console.info(weekReport(createStores(db), { ...range, now }));
