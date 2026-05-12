import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SkeletonOnboarding } from "./SkeletonOnboarding";

describe("SkeletonOnboarding", () => {
  it("renders without crashing", () => {
    expect(() => render(<SkeletonOnboarding />)).not.toThrow();
  });
});
