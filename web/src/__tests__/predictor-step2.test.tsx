import { beforeEach, describe, expect, test } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PredictorStep2Page } from "../pages/predictor/PredictorStep2Page";
import { clearPredictorDraft, savePredictorDraft } from "../utils/predictorStorage";

describe("PredictorStep2Page", () => {
  beforeEach(() => {
    clearPredictorDraft();
    savePredictorDraft({
      athlete: { sex: "male", ageGroup: "30-34", division: "open" },
      benchmarks: { run5kSeconds: 1350, backSquat3RM: 120, deadlift3RM: 160 },
    });
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={["/hyrox-predictor/benchmarks"]}>
        <PredictorStep2Page />
      </MemoryRouter>,
    );
  }

  test("renders with populated step 1 draft and allows empty optional fields", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: /Extra inputs/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^next$/i })).not.toBeDisabled();
  });

  test("shows an error for out-of-range previous HYROX time", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/previous hyrox finish time/i), { target: { value: "8:20" } });

    expect(screen.getByText(/between 1:00:00 and 5:00:00/i)).toBeInTheDocument();
  });
});
