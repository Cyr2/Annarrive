import { loadConfig } from "../config.ts";
import { levelReport } from "../services/level.ts";
import { openDatabase } from "../storage/db.ts";
import { createStores } from "../storage/stores.ts";
import { systemClock, toParisLocal } from "../time.ts";

// The app has one runner: the name only labels the output, so a pasted report says whose it is.
const [name] = process.argv.slice(2);
const stores = createStores(openDatabase(loadConfig(process.env).DATA_DIR));
if (name) console.info(`Compte : ${name}`);
console.info(levelReport(stores, toParisLocal(systemClock())));
