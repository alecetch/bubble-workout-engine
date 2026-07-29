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
});
