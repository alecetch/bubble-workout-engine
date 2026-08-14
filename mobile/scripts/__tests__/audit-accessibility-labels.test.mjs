import assert from "node:assert";
import test from "node:test";
import { auditFile } from "../audit-accessibility-labels.mjs";

test("flags a Pressable with no accessibilityLabel and no Text child", () => {
  const gaps = auditFile(
    `
      <Pressable onPress={onPress}>
        <Ionicons name="close" />
      </Pressable>
    `,
    "src/components/Foo.tsx",
  );

  assert.deepEqual(gaps, [{ file: "src/components/Foo.tsx", line: 2 }]);
});

test("does not flag a PressableScale with an accessibilityLabel", () => {
  const gaps = auditFile(
    `
      <PressableScale accessibilityLabel="Close" onPress={onPress}>
        <Ionicons name="close" />
      </PressableScale>
    `,
    "src/components/Foo.tsx",
  );

  assert.deepEqual(gaps, []);
});

test("does not flag icon plus Text roll-up cases", () => {
  const gaps = auditFile(
    `
      <PressableScale onPress={onPress}>
        <Ionicons name="add-circle-outline" />
        <Text>Add set</Text>
      </PressableScale>
    `,
    "src/components/Foo.tsx",
  );

  assert.deepEqual(gaps, []);
});

test("detects multi-line labeled tags", () => {
  const gaps = auditFile(
    `
      <PressableScale
        style={styles.button}
        accessibilityLabel="Add set"
        onPress={() => handleAddSet(exercise)}
      >
        <Ionicons name="add-circle-outline" />
      </PressableScale>
    `,
    "src/components/Foo.tsx",
  );

  assert.deepEqual(gaps, []);
});
