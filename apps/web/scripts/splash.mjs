// Draws the iOS startup images: the empty dawn sky the launch animation opens on (index.html, #splash), one per
// iPhone screen in portrait, so the system splash flows into the first frame. Run after changing the sky's colours
// (styles/tokens.css, --sky) or to add a screen: `node scripts/splash.mjs`. The PNGs are committed.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const STOPS = [
  [0, [0xfd, 0xed, 0xe3]],
  [0.18, [0xfd, 0xf1, 0xea]],
  [0.4, [0xfb, 0xf6, 0xf2]],
  [1, [0xf9, 0xf6, 0xf3]],
];

// CSS width, height and pixel ratio of each iPhone screen since the X.
const SCREENS = [
  [440, 956, 3],
  [420, 912, 3],
  [402, 874, 3],
  [430, 932, 3],
  [393, 852, 3],
  [428, 926, 3],
  [390, 844, 3],
  [375, 812, 3],
  [414, 896, 3],
  [414, 896, 2],
  [375, 667, 2],
];

function colourAt(t) {
  const upper = STOPS.findIndex(([at]) => at >= t);
  if (upper <= 0) return STOPS[0][1];
  const [a, from] = STOPS[upper - 1];
  const [b, to] = STOPS[upper];
  return from.map((c, i) => Math.round(c + ((to[i] - c) * (t - a)) / (b - a)));
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (bytes) => (bytes.reduce((c, b) => crcTable[(c ^ b) & 0xff] ^ (c >>> 8), 0xffffffff) ^ 0xffffffff) >>> 0;

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc(body), body.length + 4);
  return out;
}

/** An RGB PNG whose every row is one colour of the gradient: rows filtered « Sub », so it deflates to almost nothing. */
function png(width, height) {
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const offset = y * (width * 3 + 1);
    rows[offset] = 1;
    rows.set(colourAt(y / (height - 1)), offset + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const links = SCREENS.map(([w, h, ratio]) => {
  const file = `splash-${w * ratio}x${h * ratio}.png`;
  writeFileSync(new URL(`../public/${file}`, import.meta.url), png(w * ratio, h * ratio));
  return `<link rel="apple-touch-startup-image" href="/${file}" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)" />`;
});
// The lines for index.html.
console.info(links.join("\n"));
