import React from "react";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { YearShareFrame, SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from "./YearShareFrame";
vi.mock("../../config/brand", () => ({ BRAND_WORDMARK: "Test wordmark", BRAND_DOMAIN: "example.test" }));
it("uses the central brand and a fixed Stories canvas with safe margins", () => {
  render(<YearShareFrame><span>Training year</span></YearShareFrame>);
  expect(screen.getByText("Test wordmark")).toBeInTheDocument();
  expect(screen.getByText("example.test")).toBeInTheDocument();
  expect(screen.getByText("Training year")).toBeInTheDocument();
  expect(SHARE_CARD_WIDTH * 3).toBe(1080);
  expect(SHARE_CARD_HEIGHT * 3).toBe(1920);
  expect(screen.getByTestId("year-share-frame")).toHaveStyle({ width: "360px", height: "640px", paddingTop: "84px", paddingBottom: "84px" });
});
