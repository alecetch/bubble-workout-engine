import { BRAND_WORDMARK } from "../../config/brand";
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PRShareCard } from "./PRShareCard";

describe("PRShareCard", () => {
  it("renders current brand copy without the old brand", () => {
    render(
      <PRShareCard
        exerciseName="Back Squat"
        e1rmKg={140}
        dateLabel="22 Aug"
        cardRef={React.createRef()}
      />,
    );

    expect(screen.getByText(BRAND_WORDMARK)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bForma\b/);
    expect(screen.getByText(`Training with ${BRAND_WORDMARK}`)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Formai");
  });
});
