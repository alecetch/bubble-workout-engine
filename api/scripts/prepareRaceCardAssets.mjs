import sharp from "sharp";
import { mkdir, stat } from "fs/promises";
import { join } from "path";

const outDir = "src/hyrox/reports/assets";
const iconDir = "../docs/planning/hyrox_calculator/icons";
const heroPath = "../docs/planning/hyrox_calculator/images/hyrox race end.png";

const hexIcons = [
  ["hyrox running hex icon.png", "hex-running.png"],
  ["hyrox skierg hex icon.png", "hex-skierg.png"],
  ["hyrox sled push hex icon.png", "hex-sled-push.png"],
  ["hyrox sled pull hex icon.png", "hex-sled-pull.png"],
  ["hyrox burpee hex icon.png", "hex-burpee.png"],
  ["hyrox rowerg hex icon.png", "hex-row.png"],
  ["hyrox farmers hex icon.png", "hex-farmers.png"],
  ["hyrox sandbag hex icon.png", "hex-sandbag.png"],
  ["hyrox wall balls hex icon.png", "hex-wall-balls.png"],
];

const simpleIcons = [
  ["hyrox running simple icon.png", "simple-running.png"],
  ["hyrox skierg simple icon.png", "simple-skierg.png"],
  ["hyrox sled push simple icon.png", "simple-sled-push.png"],
  ["hyrox sled pull simple icon.png", "simple-sled-pull.png"],
  ["hyrox burpee simple icon.png", "simple-burpee.png"],
  ["hyrox rowerg simple icon.png", "simple-row.png"],
  ["hyrox farmers carry simple icon.png", "simple-farmers.png"],
  ["hyrox sandbag simple icon.png", "simple-sandbag.png"],
  ["hyrox wall ball simple icon.png", "simple-wall-ball.png"],
];

await mkdir(outDir, { recursive: true });

for (const [source, dest] of hexIcons) {
  await sharp(join(iconDir, source))
    .resize(220, 220, { fit: "cover" })
    .png({ palette: true, colours: 48, compressionLevel: 9, effort: 10, quality: 65, dither: 0.4 })
    .toFile(join(outDir, dest));
}

for (const [source, dest] of simpleIcons) {
  await sharp(join(iconDir, source))
    .resize(96, 96, { fit: "cover" })
    .png({ palette: true, colours: 64, compressionLevel: 9, effort: 10, quality: 75, dither: 0.6 })
    .toFile(join(outDir, dest));
}

await sharp(heroPath)
  .resize(440, 600, { fit: "cover" })
  .jpeg({ quality: 80, mozjpeg: true })
  .toFile(join(outDir, "hero-race-end.jpg"));

for (const file of [...hexIcons, ...simpleIcons].map(([, dest]) => dest).concat("hero-race-end.jpg").sort()) {
  const { size } = await stat(join(outDir, file));
  console.log(`${file}\t${size}`);
}
