import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(__dirname, "../../assets/exercise-media/_placeholder/still.jpg");

await mkdir(dirname(outputPath), { recursive: true });

await sharp({
  create: {
    width: 800,
    height: 800,
    channels: 3,
    background: "#111827",
  },
})
  .composite([
    {
      input: Buffer.from(
        `<svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#1E293B"/>
              <stop offset="0.55" stop-color="#0F172A"/>
              <stop offset="1" stop-color="#111827"/>
            </linearGradient>
          </defs>
          <rect width="800" height="800" fill="url(#g)"/>
          <circle cx="640" cy="140" r="220" fill="#3B82F6" fill-opacity="0.13"/>
          <circle cx="120" cy="680" r="260" fill="#22C55E" fill-opacity="0.08"/>
        </svg>`,
      ),
      top: 0,
      left: 0,
    },
  ])
  .jpeg({ quality: 84, mozjpeg: true })
  .toFile(outputPath);

console.log(`Wrote ${outputPath}`);
