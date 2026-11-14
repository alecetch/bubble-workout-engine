import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkBrandStrings, checkWebsiteBrandStrings, evaluateWebsiteBrandStrings, WEBSITE_BRAND_BASELINE } from "../check-brand-strings.mjs";

function makeFixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "brand-strings-"));
}

function writeFile(rootDir, relativePath, contents) {
  const absolutePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
}

function writeCleanAppJson(rootDir) {
  writeFile(
    rootDir,
    "app.json",
    JSON.stringify(
      {
        expo: {
          name: "Forma",
          slug: "forma",
          scheme: "forma",
          ios: { bundleIdentifier: "com.forma.mobile" },
          android: { package: "com.forma.mobile" },
        },
      },
      null,
      2,
    ),
  );
}

test("passes a clean fixture tree", () => {
  const rootDir = makeFixture();
  writeCleanAppJson(rootDir);
  writeFile(rootDir, "src/screens/Home.tsx", `export const label = "Forma";\n`);

  const result = checkBrandStrings(rootDir);

  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
});

test("detects forbidden brand strings in source files", () => {
  const rootDir = makeFixture();
  writeCleanAppJson(rootDir);
  writeFile(rootDir, "src/screens/Home.tsx", `export const label = "Welcome to Formai";\n`);

  const result = checkBrandStrings(rootDir);

  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].file, "src/screens/Home.tsx");
  assert.match(result.message, /src\/screens\/Home\.tsx:1 matched "Formai"/);
});

test("scans the central share-card brand module without an exemption", () => {
  const rootDir = makeFixture();
  writeCleanAppJson(rootDir);
  writeFile(rootDir, "src/config/brand.ts", 'export const BRAND_WORDMARK = "Formai";\n');
  const result = checkBrandStrings(rootDir);
  assert.equal(result.ok, false);
  assert.equal(result.violations[0].file, "src/config/brand.ts");
});

test("allows Forma native identifiers in app.json", () => {
  const rootDir = makeFixture();
  writeFile(
    rootDir,
    "app.json",
    JSON.stringify(
      {
        expo: {
          name: "Forma",
          slug: "bubble-workout-mobile",
          scheme: "forma",
          ios: { bundleIdentifier: "fit.getforma.app" },
          android: { package: "fit.getforma.app" },
        },
      },
      null,
      2,
    ),
  );

  const result = checkBrandStrings(rootDir);

  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
});

test("flags the retired bubbleworkout app ID and formai scheme in app.json", () => {
  const rootDir = makeFixture();
  writeFile(
    rootDir,
    "app.json",
    JSON.stringify(
      {
        expo: {
          name: "Forma",
          scheme: "formai",
          ios: { bundleIdentifier: "com.bubbleworkout.mobile" },
        },
      },
      null,
      2,
    ),
  );

  const result = checkBrandStrings(rootDir);

  assert.equal(result.ok, false);
});

test("new website Forma findings fail the CLI independently of mobile checks", t => {
  const root = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeCleanAppJson(path.join(root, "mobile"));
  writeFile(root, "api/src/routes/home.js", 'const title = "Forma";');
  assert.deepEqual(checkWebsiteBrandStrings(root), [{ file: "api/src/routes/home.js", count: 1 }]);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../check-brand-strings.mjs", import.meta.url)), "--root", path.join(root, "mobile")], { encoding: "utf8" });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Website brand guard: api\/src\/routes\/home\.js: 1 \(allowed 0\)/);
  writeFile(root, "mobile/src/bad.ts", 'const title = "bubble workout";');
  const failed = spawnSync(process.execPath, [fileURLToPath(new URL("../check-brand-strings.mjs", import.meta.url)), "--root", path.join(root, "mobile")], { encoding: "utf8" });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /Found stale brand strings/);
  assert.match(failed.stderr, /Website brand guard:/);
});

test("website scan avoids substrings and ignores tests", t => {
  const root = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeFile(root, "api/src/routes/home.js", 'const format = performance + targetFormatted;');
  writeFile(root, "api/src/routes/__tests__/home.test.js", '"Forma"');
  writeFile(root, "api/src/views/page.test.js", '"Forma"');
  assert.deepEqual(checkWebsiteBrandStrings(root), []);
});

test("website brand module, retained scheme and old assets are allowlisted", t => {
  const root = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeFile(root, "api/src/config/brand.js", '"Forma getforma.fit"');
  writeFile(root, "api/src/views/page.html", '<a href="forma://">Forma</a>\n<img src="/images/forma_icon.png" alt="Forma">\n<img src="/images/formai_icon.svg" alt="Formai">');
  assert.deepEqual(checkWebsiteBrandStrings(root), []);
});


test("a new website file fails with no allowed matches", () => {
  const result = evaluateWebsiteBrandStrings([{ file: "api/src/routes/new.js", count: 1 }], {});
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [{ file: "api/src/routes/new.js", count: 1, allowed: 0 }]);
});

test("website counts above baseline fail and equal counts pass", () => {
  const baseline = { "api/src/routes/legacy.js": 2 };
  assert.equal(evaluateWebsiteBrandStrings([{ file: "api/src/routes/legacy.js", count: 3 }], baseline).ok, false);
  assert.deepEqual(evaluateWebsiteBrandStrings([{ file: "api/src/routes/legacy.js", count: 2 }], baseline), { ok: true, failures: [], notes: [] });
});

test("lower counts pass and suggest lowering the baseline, including removed files", () => {
  const baseline = { "api/src/routes/legacy.js": 2, "api/src/routes/removed.js": 1 };
  const result = evaluateWebsiteBrandStrings([{ file: "api/src/routes/legacy.js", count: 1 }], baseline);
  assert.equal(result.ok, true);
  assert.deepEqual(result.notes, [{ file: "api/src/routes/legacy.js", count: 1, allowed: 2 }, { file: "api/src/routes/removed.js", count: 0, allowed: 1 }]);
  assert.deepEqual(baseline, { "api/src/routes/legacy.js": 2, "api/src/routes/removed.js": 1 });
});

test("real repository scan passes the baseline budget and CLI exits zero", () => {
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  assert.equal(evaluateWebsiteBrandStrings(checkWebsiteBrandStrings(repoRoot), WEBSITE_BRAND_BASELINE).ok, true);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../check-brand-strings.mjs", import.meta.url))], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Website brand guard passed/);
});


test("web source, CSS and index branding have no baseline allowance", t => {
  const root = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeCleanAppJson(path.join(root, "mobile"));
  for (const file of ["web/src/pages/Home.tsx", "web/src/config/name.ts", "web/src/style.css", "web/index.html"]) writeFile(root, file, '"Forma"');
  writeFile(root, "web/src/__tests__/brand.test.tsx", '"Forma"');
  writeFile(root, "web/src/other.test.ts", '"Forma"');
  const findings = checkWebsiteBrandStrings(root);
  assert.equal(findings.length, 4);
  assert.equal(evaluateWebsiteBrandStrings(findings, {}).ok, false);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../check-brand-strings.mjs", import.meta.url)), "--root", path.join(root, "mobile")], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Website brand guard: web\/src\/pages\/Home.tsx: 1 \(allowed 0\)/);
});

test("quoted legacy storage keys pass without masking other branding on the same line", t => {
  const root = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeFile(root, "web/src/storage.ts", ['"forma.hyroxCalculatorDraft"', "'forma.hyroxPredictorDraft'", '`forma.raceCardPreviewed.`'].join("\n"));
  assert.deepEqual(checkWebsiteBrandStrings(root), []);
  writeFile(root, "web/src/storage.ts", 'const key = "forma.hyroxCalculatorDraft"; const title = "Forma";');
  assert.deepEqual(checkWebsiteBrandStrings(root), [{ file: "web/src/storage.ts", count: 1 }]);
});

test("HYROX and admin scope reject new branding but exclude insight posts and tests", t => {
  const root = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeFile(root, "api/src/hyrox/new.js", '"Forma"');
  writeFile(root, "api/admin/new.html", 'Forma');
  writeFile(root, "api/src/hyrox/reports/insightPosts/legacy.js", '"Forma"');
  writeFile(root, "api/src/hyrox/__tests__/legacy.test.js", '"Forma"');
  const findings = checkWebsiteBrandStrings(root);
  assert.equal(findings.length, 2);
  assert.equal(evaluateWebsiteBrandStrings(findings, WEBSITE_BRAND_BASELINE).ok, false);
});
test("H3 files pass at their frozen budget and fail above it", t => {
  const root = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = "api/src/hyrox/reports/raceCardBuilder.js";
  const budget = WEBSITE_BRAND_BASELINE[file];
  writeFile(root, file, Array(budget).fill('"Forma"').join("\n"));
  assert.equal(evaluateWebsiteBrandStrings(checkWebsiteBrandStrings(root), WEBSITE_BRAND_BASELINE).ok, true);
  writeFile(root, file, Array(budget + 1).fill('"Forma"').join("\n"));
  assert.equal(evaluateWebsiteBrandStrings(checkWebsiteBrandStrings(root), WEBSITE_BRAND_BASELINE).ok, false);
});
