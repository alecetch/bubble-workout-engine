import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { REGION_LABELS, countryToRegion } from "../regionMapping.js";

describe("countryToRegion", () => {
  it("maps GBR to europe", () => assert.equal(countryToRegion("GBR"), "europe"));
  it("maps stored country names", () => assert.equal(countryToRegion("United Kingdom"), "europe"));
  it("maps lowercase country codes", () => assert.equal(countryToRegion("gbr"), "europe"));
  it("maps SGP to asia", () => assert.equal(countryToRegion("SGP"), "asia"));
  it("maps Hong Kong to asia", () => assert.equal(countryToRegion("Hong Kong"), "asia"));
  it("maps AUS to oceania", () => assert.equal(countryToRegion("AUS"), "oceania"));
  it("maps USA to americas", () => assert.equal(countryToRegion("USA"), "americas"));
  it("maps ZAF to africa_me", () => assert.equal(countryToRegion("ZAF"), "africa_me"));
  it("returns null for unknown codes", () => assert.equal(countryToRegion("XYZ"), null));
  it("returns null for null input", () => assert.equal(countryToRegion(null), null));
  it("returns null for empty input", () => assert.equal(countryToRegion(""), null));
});

describe("REGION_LABELS", () => {
  it("has a label for every region key", () => {
    for (const key of ["europe", "oceania", "americas", "asia", "africa_me"]) {
      assert.ok(REGION_LABELS[key], `missing label for ${key}`);
    }
  });
});
