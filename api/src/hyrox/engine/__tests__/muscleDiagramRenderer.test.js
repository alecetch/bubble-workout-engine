import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderMuscleDiagramPair } from "../muscleDiagramRenderer.js";

describe("muscleDiagramRenderer", () => {
  it("returns null when muscleGroupProfile.available is false", () => {
    assert.equal(renderMuscleDiagramPair({ available: false }), null);
  });

  it("returns null when muscleGroupProfile is null", () => {
    assert.equal(renderMuscleDiagramPair(null), null);
  });

  it("returns frontSvg and backSvg strings for male", () => {
    const result = renderMuscleDiagramPair({ available: true, muscleGroupSignals: [] }, "male");
    assert.ok(result !== null);
    assert.equal(typeof result.frontSvg, "string");
    assert.equal(typeof result.backSvg, "string");
    assert.ok(result.frontSvg.includes("<svg"));
    assert.ok(result.backSvg.includes("</svg>"));
  });

  it("uses woman-back hamstrings2 ID for female posterior_chain limiter", () => {
    const result = renderMuscleDiagramPair({
      available: true,
      muscleGroupSignals: [{ groupId: "posterior_chain", signal: "limiter" }],
    }, "female");
    assert.ok(result.backSvg.includes("hamstrings2"), "woman-back uses hamstrings2, not hamstrings");
  });

  it("uses man-back hamstrings ID for male posterior_chain limiter", () => {
    const result = renderMuscleDiagramPair({
      available: true,
      muscleGroupSignals: [{ groupId: "posterior_chain", signal: "limiter" }],
    }, "male");
    assert.ok(!result.backSvg.includes("#hamstrings2 path"), "man-back uses hamstrings, not hamstrings2");
    assert.ok(result.backSvg.includes("#hamstrings path { fill: #ef4444; }"));
  });

  it("injects #ef4444 fill rule for a limiter group", () => {
    const result = renderMuscleDiagramPair({
      available: true,
      muscleGroupSignals: [{ groupId: "upper_back_pull", signal: "limiter" }],
    }, "male");
    assert.ok(result.frontSvg.includes("#trapezius path { fill: #ef4444; }"), "limiter colour in style block");
  });

  it("injects #22c55e fill rule for an asset group", () => {
    const result = renderMuscleDiagramPair({
      available: true,
      muscleGroupSignals: [{ groupId: "posterior_chain", signal: "asset" }],
    }, "male");
    assert.ok(result.backSvg.includes("#gluteus_maximus path { fill: #22c55e; }"), "asset colour in style block");
  });

  it("does not inject a fill rule for a neutral group", () => {
    const result = renderMuscleDiagramPair({
      available: true,
      muscleGroupSignals: [{ groupId: "grip_forearm", signal: "neutral" }],
    }, "male");
    assert.ok(!result.frontSvg.includes("#brachioradialis path { fill:"), "neutral muscle has no override");
  });

  it("strips script tags from output SVGs", () => {
    const result = renderMuscleDiagramPair({ available: true, muscleGroupSignals: [] }, "male");
    assert.ok(!result.frontSvg.includes("<script"), "no script tags in front SVG");
    assert.ok(!result.backSvg.includes("<script"), "no script tags in back SVG");
  });

  it("strips data-tooltip-text attributes from output SVGs", () => {
    const result = renderMuscleDiagramPair({ available: true, muscleGroupSignals: [] }, "male");
    assert.ok(!result.frontSvg.includes("data-tooltip-text"), "no tooltip attributes in front SVG");
  });
});
