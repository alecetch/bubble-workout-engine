import { describe, expect, it } from "vitest";
import { getJourneyVariant } from "../utils/journeyUtils";

describe("getJourneyVariant", () => {
  it("returns target-email when meta.source is analysis_email", () => {
    expect(getJourneyVariant({ meta: { source: "analysis_email" } } as any)).toBe("target-email");
  });

  it("returns target-direct when calculatorMode is target and no meta.source", () => {
    expect(getJourneyVariant({ calculatorMode: "target" } as any)).toBe("target-direct");
  });

  it("returns target-direct when calculatorMode is target and meta exists without source", () => {
    expect(getJourneyVariant({ calculatorMode: "target", meta: {} } as any)).toBe("target-direct");
  });

  it("returns analyse when calculatorMode is analyse", () => {
    expect(getJourneyVariant({ calculatorMode: "analyse" } as any)).toBe("analyse");
  });

  it("returns analyse for null draft", () => {
    expect(getJourneyVariant(null)).toBe("analyse");
  });

  it("returns analyse for undefined draft", () => {
    expect(getJourneyVariant(undefined)).toBe("analyse");
  });
});
