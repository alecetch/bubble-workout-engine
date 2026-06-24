import { beforeEach, describe, expect, test } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PredictorStep1Page } from "../pages/predictor/PredictorStep1Page";
import { clearPredictorDraft } from "../utils/predictorStorage";

describe("PredictorStep1Page", () => {
  beforeEach(() => {
    clearPredictorDraft();
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={["/hyrox-predictor"]}>
        <PredictorStep1Page />
      </MemoryRouter>,
    );
  }

  test("renders with an empty draft and disabled next button", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: /Your benchmarks/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^next$/i })).toBeDisabled();
  });

  test("enables next when all required fields are filled", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/age group/i), { target: { value: "30-34" } });
    fireEvent.change(screen.getByLabelText(/best 5k time/i), { target: { value: "22:30" } });
    fireEvent.change(screen.getByLabelText(/back squat 3rm/i), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText(/deadlift 3rm/i), { target: { value: "160" } });

    expect(screen.getByRole("button", { name: /^next$/i })).not.toBeDisabled();
  });

  test("shows an error when 10k time is faster than 5k time", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/best 5k time/i), { target: { value: "22:30" } });
    fireEvent.change(screen.getByLabelText(/best 10k time/i), { target: { value: "20:00" } });

    expect(screen.getByText(/10k time must be slower/i)).toBeInTheDocument();
  });
});
