import test from "node:test";
import assert from "node:assert/strict";
import { gatePage, wrapPage } from "../pageChrome.js";

function withPreview(value, fn) {
  const previous = process.env.MARKETING_PREVIEW_ENABLED;
  if (value == null) delete process.env.MARKETING_PREVIEW_ENABLED;
  else process.env.MARKETING_PREVIEW_ENABLED = value;
  try {
    return fn();
  } finally {
    if (previous == null) delete process.env.MARKETING_PREVIEW_ENABLED;
    else process.env.MARKETING_PREVIEW_ENABLED = previous;
  }
}

test("wrapPage uses Forma metadata and launch assets", () => {
  const html = withPreview(null, () => wrapPage("Home", "<p>Hello</p>", { canonical: "/" }));
  assert.match(html, /<title>Home - Forma<\/title>/);
  assert.match(html, /content="Home - Forma"/);
  assert.match(html, /\/images\/forma_masthead\.png/);
  assert.match(html, /\/images\/forma_icon\.png/);
  assert.doesNotMatch(html, /Formai/);
});

test("wrapPage hides preview navigation when launch gate is off", () => {
  const html = withPreview(null, () => wrapPage("Home", "<p>Hello</p>"));
  assert.match(html, /href="\/download"/);
  assert.doesNotMatch(html, /href="\/pricing"/);
  assert.doesNotMatch(html, /href="\/support"/);
});

test("wrapPage shows preview navigation when launch gate is on", () => {
  const html = withPreview("true", () => wrapPage("Home", "<p>Hello</p>"));
  assert.match(html, /href="\/pricing"/);
  assert.match(html, /href="\/support"/);
});

test("gatePage returns styled 404 unless preview is enabled", () => {
  withPreview(null, () => {
    let statusCode = 200;
    let sent = "";
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      setHeader() {
        return this;
      },
      send(body) {
        sent = body;
        return this;
      },
    };
    gatePage({}, res, () => {
      throw new Error("next should not be called");
    });
    assert.equal(statusCode, 404);
    assert.match(sent, /Page not found/);
  });

  withPreview("true", () => {
    let called = false;
    gatePage({}, {}, () => {
      called = true;
    });
    assert.equal(called, true);
  });
});
