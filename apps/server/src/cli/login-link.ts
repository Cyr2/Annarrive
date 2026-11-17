import { usernameSchema } from "@annarrive/protocol";
import { loadConfig } from "../config.ts";
import { AuthService } from "../services/auth.ts";
import { openDatabase } from "../storage/db.ts";
import { createStores } from "../storage/stores.ts";
import { systemClock } from "../time.ts";

// Prints a one-time login link valid 15 minutes. With an account name, the link then offers to add Face ID.
const config = loadConfig(process.env);
const name = process.argv[2];
const auth = new AuthService(createStores(openDatabase(config.DATA_DIR)), systemClock, config.PUBLIC_URL);
console.info(auth.createLoginLink(config.PUBLIC_URL, name === undefined ? undefined : usernameSchema.parse(name)));
