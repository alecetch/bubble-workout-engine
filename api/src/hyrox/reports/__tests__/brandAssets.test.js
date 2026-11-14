import test from "node:test";
import assert from "node:assert/strict";
import { getBrand } from "../../../config/brand.js";
import { emailLogoImg, lockupSvgInline, brandFooterLine } from "../brandAssets.js";

test("hosted lockup uses the configured brand, dimensions and escaped URL", () => {
  const brand = getBrand({ BRAND_VARIANT: "200days" });
  const html = emailLogoImg({ height: 28, brand });
  assert.match(html, /src="https:\/\/200days.app\/images\/brand\/200days-lockup@2x.png"/);
  assert.match(html, /alt="200 Days" width="58" height="28"/);
  assert.doesNotMatch(html, /data:/);
  assert.equal(brandFooterLine(brand), "200days.app");
  assert.match(emailLogoImg({ brand: getBrand({ BRAND_VARIANT: "200days", BASE_URL: "https://preview.example/" }) }), /src="https:\/\/preview.example\/images/);
});
test("SVG lockup preserves viewBox and can render different sizes from cache", () => {
  const brand = getBrand({ BRAND_VARIANT: "200days" });
  for (const height of [28, 36]) {
    const svg = lockupSvgInline({ height, brand });
    assert.match(svg, /<svg/);
    assert.match(svg, /viewBox=/);
    assert.ok(svg.includes(`height="${height}"`));
    assert.ok(svg.includes(`width="${Math.round(height * brand.logo.lockupAspect)}"`));
  }
});
test("legacy logo retains the embedded PNG and masthead proportions", () => {
  const brand = getBrand({});
  assert.match(emailLogoImg({ height: 28, brand }), /data:image\/png;base64,/);
  assert.match(emailLogoImg({ height: 28, brand }), /alt="Forma — Measure\. Understand\. Improve\." width="160" height="28"/);
  assert.equal(brandFooterLine(brand), "www.getforma.fit");
});
