// Renders the PNG icons iOS and the manifest need from public/icon.svg, with a local Chrome in headless mode.
// Run once after changing the SVG: `node scripts/icons.mjs` (CHROME_PATH to point at another browser).
// The PNGs are committed, so the build never needs a browser.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const svg = readFileSync(join(publicDir, "icon.svg"), "utf8");
const brand = svg.match(/fill="(#[0-9A-Fa-f]{6})"/)?.[1] ?? "#FF6A2C";

const candidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const chrome = candidates.find((path) => existsSync(path));
if (!chrome) throw new Error("Chrome introuvable : définis CHROME_PATH");

// `full`: square and full bleed (iOS rounds it itself). `safe`: the glyph inside the maskable safe zone (80 %).
const icons = [
  { file: "apple-touch-icon.png", size: 180, mode: "full" },
  { file: "icon-192.png", size: 192, mode: "plain" },
  { file: "icon-512.png", size: 512, mode: "plain" },
  { file: "icon-maskable-512.png", size: 512, mode: "safe" },
];

const work = mkdtempSync(join(tmpdir(), "annarrive-icons-"));
for (const { file, size, mode } of icons) {
  const scale = mode === "safe" ? 0.8 : 1;
  const background = mode === "plain" ? "transparent" : brand;
  const html = `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${background}">
<div style="width:${size * scale}px;height:${size * scale}px">${svg.replace("<svg ", `<svg width="100%" height="100%" `)}</div></body></html>`;
  const page = join(work, `${size}-${mode}.html`);
  writeFileSync(page, html);
  execFileSync(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--default-background-color=00000000",
    `--window-size=${size},${size}`,
    `--screenshot=${join(publicDir, file)}`,
    pathToFileURL(page).href,
  ]);
  console.info(`${file} (${size} px)`);
}
