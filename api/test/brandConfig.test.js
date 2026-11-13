import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import logger from "../src/utils/logger.js";
import { getBrand, getFormaBrand } from "../src/config/brand.js";

test("Forma brand defaults remain complete and deeply frozen", () => {
  const brand = getBrand({});
  assert.deepEqual(brand, {
    variant: "forma", name: "Forma", titleSuffix: "Forma", tagline: "Measure. Understand. Improve.",
    siteUrl: "https://getforma.fit", domain: "getforma.fit", supportEmail: "support@getforma.fit", pressEmail: "hello@getforma.fit",
    logo: { header: "/images/forma_masthead.png", headerAlt: "Forma - Measure. Understand. Improve.", favicon: "/images/forma_icon.png", ogImage: "/images/forma_masthead.png", favicon32: "/images/forma_icon.png", faviconIco: "/images/forma_icon.png", appleTouchIcon: "/images/forma_icon.png", appIcon: "/images/forma_icon.png" },
    operator: "Engle Consulting Limited", operatorLine: "",
    defaultDescription: "Forma - personalised strength and conditioning programs that adapt to your performance.",
  });
  assert.ok(Object.isFrozen(brand));
  assert.ok(Object.isFrozen(brand.logo));
  for (const [key, path] of Object.entries(brand.logo)) if (key !== "headerAlt") assert.ok(existsSync(new URL(`../public${path}`, import.meta.url)), path);
});
test("brand URL and emails resolve at call time with nullish fallbacks", () => {
  const env = { BASE_URL: "https://example.com///", SUPPORT_EMAIL: "support@example.com" };
  assert.equal(getBrand(env).siteUrl, "https://example.com");
  assert.equal(getBrand(env).supportEmail, env.SUPPORT_EMAIL);
  assert.equal(getBrand(env).pressEmail, env.SUPPORT_EMAIL);
  env.PRESS_EMAIL = "press@example.com";
  assert.equal(getBrand(env).pressEmail, env.PRESS_EMAIL);
  assert.equal(getBrand({ SUPPORT_EMAIL: "", PRESS_EMAIL: "" }).pressEmail, "");
});
test("default environment is read again on each call", () => {
  const previous = process.env.BASE_URL;
  try {
    process.env.BASE_URL = "https://first.example/";
    assert.equal(getBrand().siteUrl, "https://first.example");
    process.env.BASE_URL = "https://second.example/";
    assert.equal(getBrand().siteUrl, "https://second.example");
  } finally {
    if (previous === undefined) delete process.env.BASE_URL;
    else process.env.BASE_URL = previous;
  }
});


test("200 Days brand returns every field and all assets exist", () => {
  const brand = getBrand({ BRAND_VARIANT: "200days" });
  assert.deepEqual(brand, {
    variant: "200days", name: "200 Days", titleSuffix: "200 Days", tagline: "200 days changes everything",
    defaultDescription: "200 days changes everything. Train 200 days a year. We plan every one.",
    siteUrl: "https://200days.app", domain: "200days.app", supportEmail: "support@200days.app", pressEmail: "hello@200days.app",
    logo: { header: "/images/brand/200days-mark.svg", headerAlt: "", favicon: "/images/brand/favicon.svg", favicon32: "/images/brand/favicon-32.png", faviconIco: "/images/brand/favicon.ico", appleTouchIcon: "/images/brand/apple-touch-icon.png", ogImage: "/images/brand/og-200days.png", appIcon: "/images/brand/200days-icon-1024.png" },
    operator: "Engle Consulting Limited", operatorLine: "Engle Consulting Limited, trading as 200 Days",
  });
  assert.ok(Object.isFrozen(brand));
  assert.ok(Object.isFrozen(brand.logo));
  for (const [key, path] of Object.entries(brand.logo)) if (key !== "headerAlt") assert.ok(existsSync(new URL(`../public${path}`, import.meta.url)), path);
});

test("explicit Forma matches unset; URL and email overrides apply to both variants", () => {
  assert.deepEqual(getBrand({ BRAND_VARIANT: "forma" }), getBrand({}));
  for (const BRAND_VARIANT of ["forma", "200days"]) {
    const brand = getBrand({ BRAND_VARIANT, BASE_URL: "https://example.com///", SUPPORT_EMAIL: "help@example.com", PRESS_EMAIL: "press@example.com" });
    assert.equal(brand.siteUrl, "https://example.com");
    assert.equal(brand.supportEmail, "help@example.com");
    assert.equal(brand.pressEmail, "press@example.com");
    assert.equal(getBrand({ BRAND_VARIANT, SUPPORT_EMAIL: "help@example.com" }).pressEmail, "help@example.com");
  }
});

test("unknown variants fall back and warn once per process through the logger", () => {
  const original = logger.warn;
  const warnings = [];
  logger.warn = (...args) => warnings.push(args);
  try {
    for (const BRAND_VARIANT of ["unknown", "another", ""]) assert.deepEqual(getBrand({ BRAND_VARIANT }), getBrand({}));
    assert.equal(warnings.length, 1);
    assert.match(warnings[0][0], /BRAND_VARIANT.*forma/);
  } finally { logger.warn = original; }
});

test("variant is read per call while published copy remains Forma", () => {
  const previous = process.env.BRAND_VARIANT;
  try {
    process.env.BRAND_VARIANT = "200days";
    assert.equal(getBrand().name, "200 Days");
    assert.equal(getFormaBrand().name, "Forma");
    process.env.BRAND_VARIANT = "forma";
    assert.equal(getBrand().name, "Forma");
  } finally {
    if (previous === undefined) delete process.env.BRAND_VARIANT;
    else process.env.BRAND_VARIANT = previous;
  }
});
