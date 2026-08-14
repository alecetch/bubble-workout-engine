import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkA11yRegression } from "../check-a11y-regression.mjs";

function makeFixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "a11y-regression-"));
}

function writeFile(rootDir, relativePath, contents) {
  const absolutePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
}

function writeBaseline(rootDir, missingLabelCount) {
  const baselinePath = path.join(rootDir, "a11y-baseline.json");
  fs.writeFileSync(baselinePath, JSON.stringify({ missingLabelCount }, null, 2) + "\n");
  return baselinePath;
}

test("returns non-ok when audited count exceeds baseline", () => {
  const rootDir = makeFixture();
  writeFile(
    rootDir,
    "src/components/Foo.tsx",
    `
      <Pressable onPress={onPress}>
        <Ionicons name="close" />
      </Pressable>
    `,
  );
  const baselinePath = writeBaseline(rootDir, 0);

  const result = checkA11yRegression(rootDir, baselinePath);

  assert.equal(result.ok, false);
  assert.match(result.message, /Accessibility label gap increased: 0 -> 1/);
});

test("returns ok and rewrites baseline when audited count is lower", () => {
  const rootDir = makeFixture();
  writeFile(
    rootDir,
    "src/components/Foo.tsx",
    `
      <PressableScale accessibilityLabel="Close" onPress={onPress}>
        <Ionicons name="close" />
      </PressableScale>
    `,
  );
  const baselinePath = writeBaseline(rootDir, 1);

  const result = checkA11yRegression(rootDir, baselinePath);
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));

  assert.equal(result.ok, true);
  assert.equal(baseline.missingLabelCount, 0);
  assert.match(result.message, /Accessibility label gap decreased: 1 -> 0/);
});
