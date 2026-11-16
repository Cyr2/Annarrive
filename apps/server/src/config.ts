import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  DATA_DIR: z.string().default("./data"),
  WEB_DIST: z.string().optional(),
  PUBLIC_URL: z.string().url().default("http://localhost:8787"),
  ICS_URL: z.string().url().optional(),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET manque ou fait moins de 32 caractères : génère-le avec `openssl rand -hex 32`."),
});
export type Config = z.infer<typeof configSchema>;

/** Empty variables (as in .env.example) count as unset. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const set = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ""));
  const parsed = configSchema.safeParse(set);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join("\n"));
  return parsed.data;
}
