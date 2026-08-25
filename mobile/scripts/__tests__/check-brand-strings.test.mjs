import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkBrandStrings } from "../check-brand-strings.mjs";

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

test("allows retained native identifiers in app.json", () => {
  const rootDir = makeFixture();
  writeFile(
    rootDir,
    "app.json",
    JSON.stringify(
      {
        expo: {
          name: "Forma",
          slug: "forma",
          scheme: "formai",
          ios: { bundleIdentifier: "com.bubbleworkout.mobile" },
          android: { package: "com.bubbleworkout.mobile" },
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
