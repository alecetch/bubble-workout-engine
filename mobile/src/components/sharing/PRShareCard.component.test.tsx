import { useWeightUnit } from "../../api/hooks/useWeightUnit";
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
  it("shares the record in pounds",()=>{vi.mocked(useWeightUnit).mockReturnValue("lbs");render(<PRShareCard exerciseName="Squat" e1rmKg={61.23} dateLabel="20 Nov" cardRef={React.createRef()}/>);expect(screen.getByText("135 lb")).toBeInTheDocument();});
});
