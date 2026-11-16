import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// No skips: route/service imports must remain safe without opening connections/listeners.
const SKIP_IMPORT = [];
async function check(name, action) {
  try { await action(); console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); process.exit(1); }
}
console.log(`node ${process.version}`);
await check("sharp", async () => {
  const { default: sharp } = await import("sharp");
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#fff" } }).png().toBuffer();
  const result = await sharp(png).resize(1, 1).png().toBuffer(); assert.ok(result.length);
});
await check("Chromium", async () => {
  let timer;
  try {
    await Promise.race([
      (async () => {
        const { launchBrowser } = await import("../src/hyrox/sharePack/slideScreenshotter.js");
        const browser = await launchBrowser();
        try { const page = await browser.newPage(); await page.setContent("<p>ok</p>"); const png = await page.screenshot({ clip: { x: 0, y: 0, width: 10, height: 10 } }); assert.ok(png.length); }
        finally { await browser.close(); }
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error("Chromium exceeded 30 seconds")), 30000); }),
    ]);
  } finally { clearTimeout(timer); }
});
await check("ffmpeg", () => { const output = execFileSync("ffmpeg", ["-version"], { timeout: 10000 }); assert.ok(output.length); });
async function collect(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collect(full));
    else if (entry.name.endsWith(".js") && !entry.name.endsWith(".test.js")) files.push(full);
  }
  return files.sort();
}
await check("app modules", async () => {
  const files = [...await collect(join(ROOT, "src/routes")), ...await collect(join(ROOT, "src/services"))];
  let count = 0;
  for (const file of files) {
    if (SKIP_IMPORT.includes(file)) continue;
    try { await import(pathToFileURL(file).href); count++; }
    catch (error) { throw Error(`${file.slice(ROOT.length + 1)}: ${error.message}`); }
  }
  console.log(`Imported ${count} route/service modules.`);
});
process.exit(0);
