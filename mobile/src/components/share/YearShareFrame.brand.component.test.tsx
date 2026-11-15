import React from "react";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { YearShareFrame } from "./YearShareFrame";

vi.unmock("../../config/brand");

it("renders the live share-card domain with the real brand configuration", () => {
  render(<YearShareFrame><span>Training year</span></YearShareFrame>);
  expect(screen.getByText("200 Days")).toBeInTheDocument();
  expect(screen.getByText("200days.app")).toBeInTheDocument();
  expect(screen.queryByText("getforma.fit")).not.toBeInTheDocument();
});
