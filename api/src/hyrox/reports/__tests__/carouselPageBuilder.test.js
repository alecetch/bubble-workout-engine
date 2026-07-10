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
          regional_context: "Europe events attract a stronger-than-average field - locally, this time ranks you top 55%.",
        },
      ],
    });

    assert.match(html, /data-field="slides\.0\.regional_context"/);
    assert.match(html, /data-optional/);
    assert.match(html, /regional-context/);
  });
});
