import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSource(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

test("SkeletonBlock does not import react-native-reanimated on the workout screen path", () => {
  const source = readSource("../feedback/SkeletonBlock.tsx");
  assert.doesNotMatch(source, /from\s+["']react-native-reanimated["']/);
});

test("TechniqueSheet does not import expo-av on the workout screen path", () => {
  const source = readSource("./TechniqueSheet.tsx");
  assert.doesNotMatch(source, /from\s+["']expo-av["']/);
});
