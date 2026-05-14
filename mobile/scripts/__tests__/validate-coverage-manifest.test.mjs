import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateManifest } from "../validate-coverage-manifest.mjs";

function makeFixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "coverage-manifest-"));
  return {
    rootDir,
    manifestPath: path.join(rootDir, "coverage-manifest.json"),
  };
}

function writeFile(rootDir, relativePath, contents = "") {
  const absolutePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
}

function writeManifest(manifestPath, entries) {
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ version: "1", entries }, null, 2),
  );
}

test("happy path returns ok and counts statuses", async () => {
  const { rootDir, manifestPath } = makeFixture();
  writeFile(rootDir, "src/screens/auth/LoginScreen.tsx");
  writeFile(rootDir, "src/screens/auth/LoginScreen.component.test.tsx");
  writeFile(rootDir, "src/components/sharing/WeekShareCard.tsx");
  writeManifest(manifestPath, [
    {
      type: "screen",
      source: "src/screens/auth/LoginScreen.tsx",
      test: "src/screens/auth/LoginScreen.component.test.tsx",
      status: "covered",
      tags: ["auth"],
      reason: "",
    },
    {
      type: "component",
      source: "src/components/sharing/WeekShareCard.tsx",
      test: null,
      status: "excluded",
      tags: ["sharing"],
      reason: "native screenshot boundary",
    },
  ]);

  const result = await validateManifest(manifestPath, rootDir);

  assert.equal(result.ok, true);
  assert.equal(result.covered, 1);
  assert.equal(result.gap, 0);
  assert.equal(result.excluded, 1);
  assert.deepEqual(result.errors, []);
});

test("missing covered test file returns an existence error", async () => {
  const { rootDir, manifestPath } = makeFixture();
  writeFile(rootDir, "src/screens/auth/LoginScreen.tsx");
  writeManifest(manifestPath, [
    {
      type: "screen",
      source: "src/screens/auth/LoginScreen.tsx",
      test: "src/screens/auth/LoginScreen.component.test.tsx",
      status: "covered",
      tags: ["auth"],
      reason: "",
    },
  ]);

  const result = await validateManifest(manifestPath, rootDir);

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].check, "existence");
});

test("uncatalogued source file returns a completeness error", async () => {
  const { rootDir, manifestPath } = makeFixture();
  writeFile(rootDir, "src/screens/auth/LoginScreen.tsx");
  writeManifest(manifestPath, []);

  const result = await validateManifest(manifestPath, rootDir);

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].check, "completeness");
  assert.equal(result.errors[0].file, "src/screens/auth/LoginScreen.tsx");
});

test("gap without a reason returns a gap hygiene error", async () => {
  const { rootDir, manifestPath } = makeFixture();
  writeFile(rootDir, "src/components/interaction/PressableScale.tsx");
  writeManifest(manifestPath, [
    {
      type: "component",
      source: "src/components/interaction/PressableScale.tsx",
      test: null,
      status: "gap",
      tags: ["interaction"],
      reason: "",
    },
  ]);

  const result = await validateManifest(manifestPath, rootDir);

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].check, "gap-hygiene");
});

test("multiple errors accumulate", async () => {
  const { rootDir, manifestPath } = makeFixture();
  writeFile(rootDir, "src/screens/auth/LoginScreen.tsx");
  writeManifest(manifestPath, [
    {
      type: "screen",
      source: "src/screens/auth/LoginScreen.tsx",
      test: "src/screens/auth/LoginScreen.component.test.tsx",
      status: "covered",
      tags: ["auth"],
      reason: "",
    },
    {
      type: "component",
      source: "src/components/interaction/PressableScale.tsx",
      test: null,
      status: "gap",
      tags: ["interaction"],
      reason: "",
    },
  ]);

  const result = await validateManifest(manifestPath, rootDir);

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 2);
  assert.deepEqual(
    result.errors.map((error) => error.check),
    ["existence", "gap-hygiene"],
  );
});

test("excluded catalogued source does not return a completeness error", async () => {
  const { rootDir, manifestPath } = makeFixture();
  writeFile(rootDir, "src/components/sharing/WeekShareCard.tsx");
  writeManifest(manifestPath, [
    {
      type: "component",
      source: "src/components/sharing/WeekShareCard.tsx",
      test: null,
      status: "excluded",
      tags: ["sharing"],
      reason: "native screenshot boundary",
    },
  ]);

  const result = await validateManifest(manifestPath, rootDir);

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});
