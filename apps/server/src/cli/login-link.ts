import { loadConfig } from "../config.ts";
import { AuthService } from "../services/auth.ts";
import { openDatabase } from "../storage/db.ts";
import { createStores } from "../storage/stores.ts";
import { systemClock } from "../time.ts";

// Prints a one-time login link valid 15 minutes, for Darius to send to Anna.
const config = loadConfig(process.env);
const auth = new AuthService(createStores(openDatabase(config.DATA_DIR)), systemClock);
console.info(auth.createLoginLink(config.PUBLIC_URL));
