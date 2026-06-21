import test from "node:test";
import assert from "node:assert/strict";
import { generateCaption } from "./captionGenerator.js";

const generatedContent = {
  headline: "A useful HYROX story",
  selectedInsights: [{ evidence: ["Evidence one"], athletesInvolved: ["Alice Jones"] }],
  suggestedHandles: [],
};

test("returns caption string containing the headline", () => {
  const result = generateCaption(generatedContent, { division: "open", season: 2026 }, []);
  assert.match(result.caption, /A useful HYROX story/);
});

test("returns at least 4 hashtags including #hyrox", () => {
  const result = generateCaption(generatedContent, { division: "open", season: 2026 }, []);
  assert.equal(result.hashtags.length >= 4, true);
  assert.equal(result.hashtags.includes("#hyrox"), true);
});

test("handles from athlete registry are included when name matches", () => {
  const result = generateCaption(generatedContent, {}, [{ full_name: "Alice Jones", instagram_handle: "@alice" }]);
  assert.equal(result.handles.includes("@alice"), true);
});

test("caption contains forma.fit CTA", () => {
  const result = generateCaption(generatedContent, {}, []);
  assert.match(result.caption, /-> forma\.fit/);
});
