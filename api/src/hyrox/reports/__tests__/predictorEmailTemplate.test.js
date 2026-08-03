import assert from "node:assert/strict";
import test from "node:test";
import { buildPredictorEmailContent } from "../predictorEmailTemplate.js";

test("buildPredictorEmailContent includes prediction highlights", () => {
  const content = buildPredictorEmailContent({
    predictedFinishFormatted: "1:29:30",
    rangeLowFormatted: "1:24:00",
    rangeHighFormatted: "1:35:00",
    topLimiters: [{ label: "Wall balls" }],
    topOpportunities: [{ label: "SkiErg" }],
  }, { name: "Alex Smith" });

  assert.match(content.subject, /1:29:30/);
  assert.match(content.html, /1:29:30/);
  assert.match(content.text, /Wall balls/);
  assert.match(content.text, /SkiErg/);
  assert.match(content.text, /compare this prediction with your real result/);
});

test("buildPredictorEmailContent handles minimal predictions without undefined output", () => {
  const content = buildPredictorEmailContent({ predictedFinishFormatted: "1:40:00" }, {});

  assert.ok(content.subject.length > 0);
  assert.ok(content.html.length > 0);
  assert.ok(content.text.length > 0);
  assert.doesNotMatch(content.html, /undefined|null/);
  assert.doesNotMatch(content.text, /undefined|null/);
});
