import { usernameSchema } from "@annarrive/protocol";
import { loadConfig } from "../config.ts";
import { AuthService } from "../services/auth.ts";
import { openDatabase } from "../storage/db.ts";
import { createStores } from "../storage/stores.ts";
import { systemClock } from "../time.ts";

const USAGE = `Comptes d'Annarrivé :
  users.ts password <nom>   crée le compte s'il manque, lui donne un nouveau mot de passe (affiché une fois) et ferme ses sessions
  users.ts list             liste les comptes et leurs clés d'accès (Face ID)
  users.ts revoke <id>      supprime une clé d'accès (téléphone perdu) et ferme les sessions du compte`;

const config = loadConfig(process.env);
const auth = new AuthService(createStores(openDatabase(config.DATA_DIR)), systemClock, config.PUBLIC_URL);
const [command, arg] = process.argv.slice(2);

if (command === "password" && arg) {
  const name = usernameSchema.parse(arg);
  console.info(`Mot de passe de ${name} : ${await auth.resetPassword(name)}`);
} else if (command === "list") {
  const accounts = auth.accounts();
  if (accounts.length === 0) console.info("Aucun compte. Crée-le avec : users.ts password <nom>");
  for (const account of accounts) {
    console.info(`${account.id}${account.hasPassword ? "" : " (sans mot de passe)"}`);
    for (const key of account.passkeys)
      console.info(
        `  clé ${key.id}  ajoutée ${key.createdAt.slice(0, 10)}  utilisée ${key.lastUsedAt?.slice(0, 10) ?? "jamais"}`,
      );
  }
} else if (command === "revoke" && arg) {
  try {
    auth.revokePasskey(arg);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  console.info(`Clé ${arg} supprimée. Les sessions de son compte sont fermées.`);
} else {
  console.error(USAGE);
  process.exitCode = 1;
}
