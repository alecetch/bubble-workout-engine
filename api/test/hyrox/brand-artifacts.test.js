import { inflateRawSync } from "node:zlib";
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRaceCardHtml } from "../../src/hyrox/reports/raceCardBuilder.js";
import { buildHyroxRaceCardData } from "../../src/hyrox/reports/raceCardDataMapper.js";
import { buildCarouselPage } from "../../src/hyrox/reports/carouselPageBuilder.js";
import { buildTemplateA, buildTemplateB } from "../../src/hyrox/reports/templateSlotMapper.js";
import { buildCaption } from "../../src/hyrox/sharePack/captionBuilder.js";
import { buildMobileLandingPage } from "../../src/hyrox/sharePack/mobileLandingBuilder.js";
import { buildZip } from "../../src/hyrox/sharePack/zipBuilder.js";
import { getOrCreateSharePack } from "../../src/hyrox/sharePack/sharePackService.js";
import { SLIDE_FILENAMES } from "../../src/hyrox/sharePack/slideAssets.js";
import { reportFixture } from "../../src/hyrox/reports/__tests__/fixtures/reportFixture.js";
let previous;
beforeEach(() => { previous = { ...process.env }; process.env.BRAND_VARIANT = "200days"; delete process.env.BASE_URL; });
afterEach(() => { process.env = previous; });
const [, analysis, athlete] = reportFixture();
function clean(output, { brand = true, site = false } = {}) {
  assert.doesNotMatch(output, /\bforma\b|getforma/i);
  if (brand) assert.match(output, /200 Days|200 DAYS/);
  if (site) assert.match(output, /200days\.app/);
}
test("race card uses the inline lockup and RACE SCORE", () => {
  const html = buildRaceCardHtml(buildHyroxRaceCardData(analysis, athlete));
  clean(html, { site: true });
  assert.match(html, /aria-label="RACE SCORE/);
  assert.match(html, />RACE<\/text>/);
  assert.match(html, />SCORE<\/text>/);
  assert.match(html, /width="79" height="38"/);
});
test("both carousel templates use current brand slots", () => {
  const a = buildTemplateA(analysis, [], athlete);
  const b = buildTemplateB("open_male_30-39");
  clean(JSON.stringify(a), { site: true });
  clean(JSON.stringify(b), { site: true });
  assert.match(b.footerMeta, /^200 DAYS \| .* RESULTS$/);
  assert.equal(b.cta.brandLine, "200 days changes everything");
  for (const data of [a, b]) {
    const html = buildCarouselPage(data);
    clean(html, { site: true });
    assert.match(html, /Background artwork: instagram-bg-200days\.jpg/);
    assert.doesNotMatch(html, /instagram-watermark\.jpg/);
    const bytes = readFileSync(new URL("../../src/hyrox/reports/assets/instagram-bg-200days.jpg", import.meta.url));
    assert.ok(html.includes(bytes.toString("base64")));
  }
});
test("stored carousel chrome is refreshed without modifying persisted slots", () => {
  const stored = { brand: { product: "FORMA", site: "www.getforma.fit", strapline: "Measure. Understand. Improve." }, slides: [{ metric2_label: "FORMA SCORE" }] };
  clean(buildCarouselPage(stored), { site: true });
  assert.equal(stored.brand.product, "FORMA");
  assert.equal(stored.slides[0].metric2_label, "FORMA SCORE");
  assert.match(buildCarouselPage(stored), /RACE SCORE/);
  delete process.env.BRAND_VARIANT;
  assert.match(buildCarouselPage(stored), /Background artwork: instagram-watermark\.jpg/);
  assert.match(buildCarouselPage(stored), /alt="Forma/);
  process.env.BRAND_VARIANT = "200days";
  clean(buildCarouselPage(stored), { site: true });
});
test("caption and landing pages have no old branding", () => {
  const caption = buildCaption({ analysisJson: analysis, athleteContext: athlete });
  clean(caption);
  assert.ok(caption.endsWith("#200Days"));
  for (const options of [{ caption }, { expired: true }, { notFound: true }]) clean(buildMobileLandingPage(options));
  assert.match(buildMobileLandingPage({ expired: true }), /Generate a new pack from your HYROX report\./);

});
test("old score payloads render and new payloads retain additive aliases", () => {
  const data = buildHyroxRaceCardData(analysis, athlete);
  assert.equal(data.formaScore, data.raceScore);
  assert.equal(data.formaScoreBasis, data.raceScoreBasis);
  const old = buildRaceCardHtml({ athleteName: "Alex", formaScore: 72, formaScoreBasis: "composite" });
  assert.match(old, /aria-label="RACE SCORE 72"/);
  assert.match(old, /Composite training score/);
  assert.match(buildRaceCardHtml({ raceScore: 0, formaScore: 72 }), /aria-label="RACE SCORE 0"/);
  delete process.env.BRAND_VARIANT;
  assert.match(buildRaceCardHtml({ formaScore: 72 }), /aria-label="RACE SCORE 72"/);
});
test("newly generated zip names start with the active brand slug", async () => {
  const db = { async query(sql, params) {
    if (sql.includes("FROM hyrox_analyses")) return { rows: [{ analysis_json: analysis, display_name: "Alex Smith", race_name: "HYROX London" }] };
    if (sql.includes("INSERT INTO hyrox_share_packs")) return { rows: [{ zip_key: params[1] }] };
    return { rows: [] };
  } };
  const deps = { launchBrowser: async () => ({ close: async () => {} }), screenshotSlides: async () => SLIDE_FILENAMES.map(() => Buffer.from("png")), renderRaceCardBuffer: async () => null, putObject: async () => {}, logCalculatorEvent: async () => {} };
  const pack = await getOrCreateSharePack("example", db, deps);
  assert.equal(pack.zip_key.split("/").at(-1), "200days-hyrox-alex-smith-hyrox-london.zip");
});

// Read a ZIP entry through its central-directory record (archiver uses data descriptors).
function zipTextEntry(zip, filename) {
  let offset = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  while (offset >= 0 && zip.readUInt32LE(offset) === 0x02014b50) {
    const nameLength = zip.readUInt16LE(offset + 28);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString();
    if (name === filename) {
      const local = zip.readUInt32LE(offset + 42);
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const bytes = zip.subarray(start, start + zip.readUInt32LE(offset + 20));
      return (zip.readUInt16LE(offset + 10) === 8 ? inflateRawSync(bytes) : bytes).toString();
    }
    offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
  }
  throw new Error(`Missing ZIP entry: ${filename}`);
}
test("ZIP contains neutral posting instructions and the branded caption", async () => {
  const caption = buildCaption({ analysisJson: analysis, athleteContext: athlete });
  const zip = await buildZip(SLIDE_FILENAMES.map(() => Buffer.from("png")), caption);
  const instructions = zipTextEntry(zip, "posting-instructions.txt");
  clean(instructions, { brand: false });
  assert.ok(instructions.startsWith("How to post your HYROX carousel to Instagram"));
  assert.equal(zipTextEntry(zip, "caption.txt"), caption);
  clean(zipTextEntry(zip, "caption.txt"));
});
