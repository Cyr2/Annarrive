// A one-label change must rename only the file that holds it: every renamed file is downloaded again and turns
// a not-yet-opened screen into a stale-version reload. Builds twice, the second time with one word changed in
// Semaine, and fails if any other JS file got a new name.
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("..", import.meta.url));
const file = `${web}src/features/week/WeekScreen.tsx`;
const label = '"Semaine passée"';

const build = () => {
  execSync("pnpm exec vite build --logLevel error", { cwd: web, stdio: "inherit" });
  return new Set(readdirSync(`${web}dist/assets`).filter((f) => f.endsWith(".js")));
};

const source = readFileSync(file, "utf8");
if (!source.includes(label)) throw new Error(`${label} not found in WeekScreen.tsx: update this script`);
const before = build();
let after;
try {
  writeFileSync(file, source.replace(label, '"Semaine finie"'));
  after = build();
} finally {
  writeFileSync(file, source);
}
const renamed = [...before].filter((f) => !after.has(f));
console.info(`${before.size} JS files, renamed: ${renamed.join(", ") || "none"}`);
if (renamed.length !== 1 || !renamed[0]?.startsWith("WeekScreen-")) {
  console.error("Expected only WeekScreen-*.js to change name.");
  process.exit(1);
}
