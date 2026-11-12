import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { getBrand } from "../src/config/brand.js";

test("Forma brand defaults remain complete and deeply frozen", () => {
  const brand = getBrand({});
  assert.deepEqual(brand, {
    variant: "forma", name: "Forma", titleSuffix: "Forma", tagline: "Measure. Understand. Improve.",
    siteUrl: "https://getforma.fit", domain: "getforma.fit", supportEmail: "support@getforma.fit", pressEmail: "hello@getforma.fit",
    logo: { header: "/images/forma_masthead.png", headerAlt: "Forma - Measure. Understand. Improve.", favicon: "/images/forma_icon.png", ogImage: "/images/forma_masthead.png" },
    operator: "Engle Consulting Limited",
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
