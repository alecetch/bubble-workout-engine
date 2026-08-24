import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PRShareCard } from "./PRShareCard";

describe("PRShareCard", () => {
  it("renders Forma brand copy without the old brand", () => {
    render(
      <PRShareCard
        exerciseName="Back Squat"
        e1rmKg={140}
        dateLabel="22 Aug"
        cardRef={React.createRef()}
      />,
    );

    expect(screen.getByText("Forma")).toBeInTheDocument();
    expect(screen.getByText("Training with Forma")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Formai");
  });
});
