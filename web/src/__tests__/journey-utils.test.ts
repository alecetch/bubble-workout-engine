import { describe, expect, it } from "vitest";
import { getJourneyVariant, isRestoredTargetBranch } from "../utils/journeyUtils";

describe("getJourneyVariant", () => {
  it("returns target-email when meta.source is analysis_email", () => {
    expect(getJourneyVariant({ meta: { source: "analysis_email" } } as any)).toBe("target-email");
  });

  it("returns target-post-analysis when meta.source is analysis_complete", () => {
    expect(getJourneyVariant({ meta: { source: "analysis_complete" } } as any)).toBe("target-post-analysis");
  });

  it("returns target-post-analysis even when calculatorMode is target", () => {
    expect(getJourneyVariant({ calculatorMode: "target", meta: { source: "analysis_complete" } } as any)).toBe(
      "target-post-analysis",
    );
  });

  it("still returns target-email for analysis_email source", () => {
    expect(getJourneyVariant({ calculatorMode: "target", meta: { source: "analysis_email" } } as any)).toBe(
      "target-email",
    );
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

describe("isRestoredTargetBranch", () => {
  it("returns true for target-email", () => {
    expect(isRestoredTargetBranch("target-email")).toBe(true);
  });

  it("returns true for target-post-analysis", () => {
    expect(isRestoredTargetBranch("target-post-analysis")).toBe(true);
  });

  it("returns false for target-direct", () => {
    expect(isRestoredTargetBranch("target-direct")).toBe(false);
  });

  it("returns false for analyse", () => {
    expect(isRestoredTargetBranch("analyse")).toBe(false);
  });
});
