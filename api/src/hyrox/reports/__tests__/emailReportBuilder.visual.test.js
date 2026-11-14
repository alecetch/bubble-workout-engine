import assert from "node:assert/strict";
import test from "node:test";
import { buildEmailReport } from "../emailReportBuilder.js";

import { beforeEach, afterEach } from "node:test";
import { reportFixture } from "./fixtures/reportFixture.js";
let previous;
beforeEach(() => { previous = { ...process.env }; process.env.BRAND_VARIANT = "200days"; delete process.env.BASE_URL; });
afterEach(() => { process.env = previous; });
function withoutDataUris(html) { return String(html).replace(/data:image\/[^;"']+;base64,[^"']+/g, "data:image;base64,"); }
function fixture(options = {}) { return buildEmailReport(...reportFixture(options)).htmlBody; }

test("email head contains Google Fonts import", () => {
  assert.match(fixture(), /fonts\.googleapis\.com/);
});

test("email contains 200days.app in header and footer", () => {
  const html = fixture();
  assert.ok((html.match(/200days\.app/g) ?? []).length >= 2);
});

test("email does not contain standalone forma.fit domain", () => {
  assert.doesNotMatch(fixture(), /(^|[^a-z])forma\.fit/i);
});

test("email does not contain getformai.com", () => {
  assert.doesNotMatch(fixture(), /getformai\.com/i);
});

test("email contains the new masthead tagline and not the old header subtitle", () => {
  const html = fixture();
  assert.doesNotMatch(html, /PERFORMANCE ENGINEER/);
  assert.match(html, /alt="200 Days"/);
});

test("email contains the hosted 200 Days logo image", () => {
  const html = fixture();
  assert.match(html, /https:\/\/200days\.app\/images\/brand\/200days-lockup@2x\.png/);
  assert.doesNotMatch(html, /data:image/);
  assert.doesNotMatch(html, />F<\/span>/);
});

test("hero uses dark navy background", () => {
  assert.match(fixture(), /background-color:#07111f;padding:28px 32px 24px 29px/);
});

test("hero headline uses light text", () => {
  assert.match(fixture(), /color:#f8fafc;line-height:1\.1/);
});

test("metric strip uses dark navy background", () => {
  assert.match(fixture(), /background-color:#07111f;border-top:1px solid rgba\(148,163,184,0\.12\);border-bottom:1px solid rgba\(148,163,184,0\.12\);padding:0/);
});

test("email shell and default cards stay on the dark theme", () => {
  const html = withoutDataUris(fixture());
  assert.match(html, /<body style="margin:0;padding:0;background-color:#07111f/);
  assert.doesNotMatch(html, /background-color:#ffffff/);
  assert.doesNotMatch(html, /background-color:#f0f4f8/);
});

test("email does not render pale semantic boxes", () => {
  const html = withoutDataUris(fixture({ doubles: true, penalties: true, muscleGroup: true }));
  const paleColors = [
    "background-color:#ffffff",
    "background-color:#f8fafc",
    "background-color:#f1f5f9",
    "background-color:#e2e8f0",
    "background-color:#e0f2fe",
    "background-color:#e8f7fd",
    "background-color:#f0f9ff",
    "background-color:#fffbeb",
    "background-color:#fef3c7",
    "background-color:#fffdf7",
    "background-color:#fee2e2",
    "background-color:#fff4f4",
    "background-color:#dcfce7",
    "background-color:#f0fdf4",
    "background-color:#f5f3ff",
    "background-color:#ede9fe",
    "border:1px solid #e2e8f0",
    "border:1px solid #fde68a",
    "border:1px solid #ddd6fe",
    "border:1px solid #bae6fd",
    "border:1px solid #bdeafb",
  ];
  for (const token of paleColors) {
    assert.ok(!html.includes(token), `Expected ${token} to be normalized to the dark email theme`);
  }
  assert.match(html, /background-color:#2a1f0b/);
  assert.match(html, /background-color:#2a1114/);
  assert.match(html, /background-color:#0f2a1c/);
  assert.match(html, /background-color:#1f1735/);
  assert.match(html, /background-color:#12263d/);
});

test("analyse CTA button uses 200 Days blue", () => {
  const html = fixture({ calculatorMode: "analyse" });
  assert.match(html, /Want to work towards a target time\?/);
  assert.match(html, /background-color:#3B82F6/);
  assert.doesNotMatch(html, /BUILD MY HYROX TRAINING PLAN/);
});

test("inline logo keeps email size below clipping risk", () => {
  const html = fixture({ doubles: true, penalties: true, muscleGroup: true });
  assert.ok(html.length < 120000, `Expected generated HTML below 120KB, got ${html.length}`);
});

test("old cyan accent is fully replaced", () => {
  assert.doesNotMatch(fixture(), /#08a7f5/);
});

test("split table includes RUN and STN tags", () => {
  const html = fixture();
  assert.match(html, />RUN</);
  assert.match(html, />STN</);
});
