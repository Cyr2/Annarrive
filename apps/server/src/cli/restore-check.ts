import { checkBackup, restoreReport } from "../services/restore-check.ts";

const [file] = process.argv.slice(2);
if (!file) {
  console.error(
    "Usage : restore-check.ts <fichier de sauvegarde>   (par exemple /app/data/backups/annarrive-2026-11-19.db)",
  );
  process.exit(1);
}
try {
  const report = checkBackup(file);
  console.info(restoreReport(file, report));
  process.exit(report.ok ? 0 : 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
