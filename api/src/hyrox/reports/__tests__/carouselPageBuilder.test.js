import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCarouselPage } from "../carouselPageBuilder.js";

describe("buildCarouselPage", () => {
  it("renders the optional regional context slot on slide A1", () => {
    const html = buildCarouselPage({
      brand: { site: "forma.fit" },
      slides: [
        {
          athlete_name: "Alex Smith",
          percentile: "Alex Smith is in the Top 45%",
          regional_context: "Europe events attract a stronger-than-average field - locally, this time ranks around the 45th percentile.",
        },
      ],
    });

    assert.match(html, /data-field="slides\.0\.regional_context"/);
    assert.match(html, /data-optional/);
    assert.match(html, /regional-context/);
  });

  it("renders the Forma masthead logo and drops the old brand text", () => {
    const html = buildCarouselPage({
      brand: { site: "www.getforma.fit", product: "FORMA", strapline: "Measure. Understand. Improve." },
      slides: [{ athlete_name: "Alex Smith", percentile: "Alex Smith is in the Top 45%" }],
    });

    assert.match(html, /alt="Forma — Measure\. Understand\. Improve\."/);
    assert.equal(html.includes("PERFORMANCE ENGINEER"), false);
    assert.equal(html.includes("Performance Analytics for Hybrid Athletes"), false);
    assert.equal(/(^|[^.])forma\.fit/i.test(html.replace(/getforma\.fit/gi, "")), false, "should not contain bare forma.fit");
    assert.match(html, /www\.getforma\.fit/);
  });

  it("removes the slide 1 hero/athlete image", () => {
    const html = buildCarouselPage({
      brand: { site: "www.getforma.fit" },
      slides: [{ athlete_name: "Alex Smith", percentile: "Alex Smith is in the Top 45%", athlete_image: "/assets/media-assets/hyrox-heroes/hyrox-wall-balls-male.png" }],
    });

    assert.equal(html.includes("athlete-image"), false);
    assert.equal(html.includes("class=\"athlete-image\""), false);
  });

  it("renders exactly one watermark div per slide, all 6 slides, sharing a single embedded background image", () => {
    const html = buildCarouselPage({
      brand: { site: "www.getforma.fit" },
      slides: [{ athlete_name: "Alex Smith", percentile: "Alex Smith is in the Top 45%" }],
    });

    const watermarkDivs = html.match(/<div class="watermark"><\/div>/g) ?? [];
    assert.equal(watermarkDivs.length, 6, "expected one watermark div per slide (A1-A6)");

    // The background-image data URI must be defined once in the <style> block (as a shared
    // CSS rule), not once per <div> -- otherwise a large image would bloat the HTML 6x.
    const backgroundImageMatches = html.match(/background-image:\s*url\("data:image\/jpeg;base64,/g) ?? [];
    assert.equal(backgroundImageMatches.length, 1, "watermark background-image should be declared once in CSS, not per slide");
  });

  it("raises watermark opacity on the cover and CTA slides, keeps it subtle on data/table slides", () => {
    const html = buildCarouselPage({
      brand: { site: "www.getforma.fit" },
      slides: [{ athlete_name: "Alex Smith", percentile: "Alex Smith is in the Top 45%" }],
    });

    const baseOpacityMatch = html.match(/\.watermark\s*\{[^}]*opacity:\s*([0-9.]+)/);
    const strongOpacityMatch = html.match(/\.slide-hook \.watermark,\s*\.slide-cta \.watermark\s*\{\s*opacity:\s*([0-9.]+)/);
    assert.ok(baseOpacityMatch, "expected a base .watermark opacity rule");
    assert.ok(strongOpacityMatch, "expected a stronger opacity override for .slide-hook and .slide-cta");
    assert.ok(
      Number(strongOpacityMatch[1]) > Number(baseOpacityMatch[1]),
      "cover/CTA watermark opacity should be higher than the base (data/table) opacity",
    );
  });

  it("watermark image data is non-empty when the asset file is present", () => {
    const html = buildCarouselPage({
      brand: { site: "www.getforma.fit" },
      slides: [{ athlete_name: "Alex Smith", percentile: "Alex Smith is in the Top 45%" }],
    });

    assert.match(html, /background-image:\s*url\("data:image\/jpeg;base64,[A-Za-z0-9+/]{100,}={0,2}"\)/);
  });

  it("shows the site URL on the CTA slide and in the A2/A5 footers, not just slide A1", () => {
    // brand.site is substituted client-side by RENDERER_JS from window.templateAData, so
    // buildCarouselPage()'s static HTML always carries the placeholder text -- this asserts
    // the [data-field="brand.site"] wiring exists in the right places, not literal substitution
    // (the actual substituted render was verified visually via the Puppeteer screenshot pipeline).
    const html = buildCarouselPage({
      brand: { site: "www.getforma.fit" },
      slides: [{ athlete_name: "Alex Smith", percentile: "Alex Smith is in the Top 45%" }],
    });

    const ctaStart = html.indexOf('data-slide="A6_CTA"');
    const ctaSection = html.slice(ctaStart, html.indexOf("</section>", ctaStart));
    assert.match(ctaSection, /class="cta-url" data-field="brand\.site">/);

    const siteFieldMatches = html.match(/data-field="brand\.site"/g) ?? [];
    // A1 (.site), A6 (.cta-url), and the A2/A5 footers -- 4 total data-bound occurrences.
    assert.equal(siteFieldMatches.length, 4, "expected the site URL wired on slides A1, A2, A5, and A6");
  });
});
