import { beforeEach, describe, expect, test } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PredictorStep1Page } from "../pages/predictor/PredictorStep1Page";
import { clearPredictorDraft, loadPredictorDraft } from "../utils/predictorStorage";

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

  function fillRequiredWithoutBodyweight() {
    fireEvent.change(screen.getByLabelText(/age group/i), { target: { value: "30-34" } });
    fireEvent.change(screen.getByLabelText(/best 5k time/i), { target: { value: "22:30" } });
    fireEvent.change(screen.getByLabelText(/back squat 3rm/i), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText(/deadlift 3rm/i), { target: { value: "160" } });
  }

  test("renders with an empty draft and disabled next button", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: /Your benchmarks/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^next$/i })).toBeDisabled();
  });

  test("enables next when all required fields are filled", () => {
    renderPage();

    fillRequiredWithoutBodyweight();
    fireEvent.change(screen.getByLabelText(/bodyweight/i), { target: { value: "85" } });

    expect(screen.getByRole("button", { name: /^next$/i })).not.toBeDisabled();
  });

  test("bodyweight is required before next is enabled", () => {
    renderPage();

    fillRequiredWithoutBodyweight();

    expect(screen.getByRole("button", { name: /^next$/i })).toBeDisabled();
  });

  test("out-of-range bodyweight shows an inline error and disables next", () => {
    renderPage();

    fillRequiredWithoutBodyweight();
    fireEvent.change(screen.getByLabelText(/bodyweight/i), { target: { value: "10" } });

    expect(screen.getByText(/enter a bodyweight between 30-250 kg/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^next$/i })).toBeDisabled();
  });

  test("height stays optional", () => {
    renderPage();

    fillRequiredWithoutBodyweight();
    fireEvent.change(screen.getByLabelText(/bodyweight/i), { target: { value: "85" } });

    expect(screen.getByLabelText(/height/i)).toHaveValue(null);
    expect(screen.getByRole("button", { name: /^next$/i })).not.toBeDisabled();
  });

  test("lb bodyweight is converted and saved as kg", () => {
    renderPage();

    fillRequiredWithoutBodyweight();
    fireEvent.click(screen.getByRole("button", { name: /^lb$/i }));
    fireEvent.change(screen.getByLabelText(/bodyweight/i), { target: { value: "198" } });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));

    expect(loadPredictorDraft().athlete.weightUnit).toBe("lb");
    expect(loadPredictorDraft().benchmarks.bodyweightKg).toBeCloseTo(89.81, 1);
  });

  test("ft-in height is converted and saved as cm", () => {
    renderPage();

    fillRequiredWithoutBodyweight();
    fireEvent.change(screen.getByLabelText(/bodyweight/i), { target: { value: "85" } });
    fireEvent.click(screen.getByRole("button", { name: /ft-in/i }));
    fireEvent.change(screen.getByLabelText(/feet/i), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText(/inches/i), { target: { value: "11" } });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));

    expect(loadPredictorDraft().athlete.heightUnit).toBe("ftin");
    expect(loadPredictorDraft().benchmarks.heightCm).toBeCloseTo(180.34, 1);
  });

  test("shows an error when 10k time is faster than 5k time", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/best 5k time/i), { target: { value: "22:30" } });
    fireEvent.change(screen.getByLabelText(/best 10k time/i), { target: { value: "20:00" } });

    expect(screen.getByText(/10k time must be slower/i)).toBeInTheDocument();
  });
});
