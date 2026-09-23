import test from "node:test";
import assert from "node:assert/strict";
import { inspectSource } from "../check-ios-safety.mjs";

test("allows static UI and finite animations, ignoring comments", () => {
  assert.deepEqual(inspectSource('// withRepeat(x, -1); import "expo-av";\nwithRepeat(x, 2);'), []);
});
test("rejects multiline infinite repeats and imported aliases", () => {
  assert.equal(inspectSource('import {withRepeat as repeat} from "react-native-reanimated"; repeat(\n timing(1),\n -1, true);').length, 1);
  assert.equal(inspectSource('Animated.withRepeat(animation, 0);').length, 1);
  assert.equal(inspectSource('withRepeat(animation, count);').length, 1);
  assert.equal(inspectSource('withRepeat(animation, 1e999);').length, 1);
});
test("rejects expo-av imports, re-exports and lazy loads", () => {
  for (const text of ['import {Video} from "expo-av";', 'export * from "expo-av";', 'require("expo-av");', 'import("expo-av");']) assert.equal(inspectSource(text).length, 1);
});
