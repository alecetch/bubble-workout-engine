import test, { beforeEach, afterEach } from "node:test";
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

test("wrapPage footer shows the company's registered details", () => {
  const html = withPreview(null, () => wrapPage("Home", "<p>Hello</p>"));
  assert.match(html, /Engle Consulting Limited is registered in England and Wales, company number 06771687\./);
  assert.match(html, /Registered office: Grain Store, Sheepstreet Lane, Etchingham, East Sussex TN19 7AY\./);
});


let savedBrandEnv;
beforeEach(() => {
  savedBrandEnv = { BRAND_VARIANT: process.env.BRAND_VARIANT, BASE_URL: process.env.BASE_URL };
  delete process.env.BRAND_VARIANT;
  delete process.env.BASE_URL;
});
afterEach(() => {
  for (const [key, value] of Object.entries(savedBrandEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test("200 Days chrome includes mark, live name, icons and absolute SEO URLs", () => {
  process.env.BRAND_VARIANT = "200days";
  const html = wrapPage("Home", "<p>Hello</p>", { canonical: "/download" });
  assert.match(html, /<title>Home - 200 Days<\/title>/);
  assert.match(html, /property="og:title" content="Home - 200 Days"/);
  assert.match(html, /name="twitter:title" content="Home - 200 Days"/);
  assert.match(html, /<img src="\/images\/brand\/200days-mark.svg" width="32" height="32" alt="">/);
  assert.match(html, /<span class="logo-text">200 Days<\/span>/);
  assert.doesNotMatch(html, /forma_masthead/);
  for (const tag of [
    '<link rel="icon" href="/images/brand/favicon.svg" type="image/svg+xml">',
    '<link rel="icon" href="/images/brand/favicon-32.png" sizes="32x32">',
    '<link rel="alternate icon" href="/images/brand/favicon.ico">',
    '<link rel="apple-touch-icon" href="/images/brand/apple-touch-icon.png">',
    '<meta name="theme-color" content="#0F172A">',
    '<meta property="og:image" content="https://200days.app/images/brand/og-200days.png">',
    '<meta name="twitter:image" content="https://200days.app/images/brand/og-200days.png">',
    '<link rel="canonical" href="https://200days.app/download">',
  ]) assert.ok(html.includes(tag), tag);
  assert.match(html, /200 days changes everything. Train 200 days a year. We plan every one./);
});

test("Forma keeps its single icon and gains absolute image and default canonical", () => {
  const html = wrapPage("Home", "", { canonical: "/" });
  assert.match(html, /property="og:image" content="https:\/\/getforma.fit\/images\/forma_masthead.png"/);
  assert.match(html, /rel="canonical" href="https:\/\/getforma.fit\/"/);
  assert.equal((html.match(/<link rel="icon"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /theme-color|alternate icon|apple-touch-icon|class="logo-text"/);
});

test("absolute image overrides are preserved and BASE_URL is normalised in both variants", () => {
  for (const variant of ["forma", "200days"]) {
    process.env.BRAND_VARIANT = variant;
    process.env.BASE_URL = "https://preview.example///";
    const html = wrapPage("Test", "", { canonical: "/test", ogImage: "https://cdn.example/image.png", description: "Custom description" });
    assert.match(html, /property="og:image" content="https:\/\/cdn.example\/image.png"/);
    assert.match(html, /rel="canonical" href="https:\/\/preview.example\/test"/);
    assert.match(html, /name="description" content="Custom description"/);
    assert.doesNotMatch(wrapPage("Test", ""), /rel="canonical"/);
  }
});
