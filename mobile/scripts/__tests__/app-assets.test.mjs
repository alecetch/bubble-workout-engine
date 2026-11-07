import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const root = new URL("../../", import.meta.url);
const { expo } = JSON.parse(readFileSync(new URL("app.json", root), "utf8"));
const splashEntries = expo.plugins.filter(entry => (Array.isArray(entry) ? entry[0] : entry) === "expo-splash-screen");

test("app config references all icon and splash files with one configured splash plugin", () => {
  assert.equal(splashEntries.length, 1);
  const splash = splashEntries[0][1];
  for (const path of [expo.icon, expo.ios.icon, expo.android.adaptiveIcon.foregroundImage,
    expo.android.adaptiveIcon.monochromeImage, splash.image, splash.dark.image]) {
    assert.equal(typeof path, "string");
    assert.ok(existsSync(new URL(path, root)), `Missing configured asset: ${path}`);
  }
  assert.equal(splash.imageWidth, 160);
  assert.equal(splash.resizeMode, "contain");
  assert.equal(splash.backgroundColor, "#0F172A");
  assert.equal(splash.dark.backgroundColor, "#0F172A");
  assert.equal(expo.android.adaptiveIcon.backgroundColor, "#0F172A");
});
for (const [name, colorType] of [["icon.png", 2], ["adaptive-icon.png", 6], ["adaptive-icon-monochrome.png", 6], ["splash-icon.png", 6]]) {
  test(`${name} is a 1024px PNG with ${colorType === 2 ? "opaque RGB" : "RGBA transparency"}`, () => {
    const png = readFileSync(new URL(`assets/${name}`, root));
    assert.deepEqual(png.subarray(0, 8), Buffer.from([137,80,78,71,13,10,26,10]));
    assert.equal(png.toString("ascii", 12, 16), "IHDR");
    assert.equal(png.readUInt32BE(16), 1024);
    assert.equal(png.readUInt32BE(20), 1024);
    assert.equal(png[25], colorType);
  });
}
test("vector source retains the stroke-based 200 Days mark and square background", () => {
  const svg = readFileSync(new URL("assets/source/app-icon.svg", root), "utf8");
  for (const id of ["background", "mark", "ring-track", "ring-progress", "digits"]) assert.ok(svg.includes(`id="${id}"`));
  assert.doesNotMatch(svg, /<text\b/);
  const background = svg.match(/<rect\b[^>]*id="background"[^>]*>/)?.[0];
  assert.ok(background);
  assert.doesNotMatch(background, /\brx=/);
});
