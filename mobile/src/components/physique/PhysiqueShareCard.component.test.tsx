import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PhysiqueShareCard } from "./PhysiqueShareCard";

vi.mock("react-native-view-shot", () => ({
  default: React.forwardRef(({ children, ...props }: any, ref: React.ForwardedRef<HTMLDivElement>) => (
    <div ref={ref} {...props}>
      {children}
    </div>
  )),
}));

vi.mock("expo-sharing", () => ({
  isAvailableAsync: vi.fn(),
  shareAsync: vi.fn(),
}));

describe("PhysiqueShareCard", () => {
  it("renders Forma brand copy without the old brand", () => {
    render(
      <PhysiqueShareCard
        scanResult={{
          ok: true,
          scan_id: "scan-1",
          physique_score: 78.4,
          score_delta: 2.1,
          observations: ["Improved posture", "More shoulder definition"],
          comparison_notes: "Improved from baseline.",
          regions: [],
          milestones_unlocked: [],
        } as any}
      />,
    );

    expect(screen.getByText("Forma")).toBeInTheDocument();
    expect(screen.getByText("Track your physique at getforma.fit")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Formai");
  });
});
