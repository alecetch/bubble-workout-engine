import { BRAND_WORDMARK } from "../../config/brand";
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeekShareCard } from "./WeekShareCard";

describe("WeekShareCard", () => {
  it("renders current brand copy without the old brand", () => {
    render(
      <WeekShareCard
        weekNumber={3}
        sessionsCompleted={4}
        totalVolumeKg={2500}
        cardRef={React.createRef()}
      />,
    );

    expect(screen.getByText(BRAND_WORDMARK)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bForma\b/);
    expect(screen.getByText(`Training with ${BRAND_WORDMARK}`)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Formai");
  });
});
