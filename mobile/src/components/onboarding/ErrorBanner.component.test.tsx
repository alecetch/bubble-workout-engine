import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErrorBanner } from "./ErrorBanner";

describe("ErrorBanner", () => {
  it("does not render the error copy when hidden", () => {
    render(<ErrorBanner visible={false} />);
    expect(screen.queryByText("Please fix the highlighted fields")).not.toBeInTheDocument();
  });

  it("renders the error copy when visible", () => {
    render(<ErrorBanner visible />);
    expect(screen.getByText("Please fix the highlighted fields")).toBeInTheDocument();
  });
});
