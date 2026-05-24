import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressHeader } from "./ProgressHeader";

describe("ProgressHeader", () => {
  it("renders Step 1 of 4", () => {
    render(<ProgressHeader step={1} />);
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
  });

  it("renders Step 2 of 4", () => {
    render(<ProgressHeader step={2} />);
    expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
  });

  it("renders Step 3 of 4", () => {
    render(<ProgressHeader step={3} />);
    expect(screen.getByText("Step 3 of 4")).toBeInTheDocument();
  });
});
