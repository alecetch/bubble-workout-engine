import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RaceDetailsPage } from "../pages/RaceDetailsPage";
import { clearDraft, loadDraft } from "../utils/storage";

vi.mock("../utils/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/api")>();
  return {
    ...actual,
    trackEvent: vi.fn(),
  };
});

describe("RaceDetailsPage calculator mode selector", () => {
  beforeEach(() => {
    clearDraft();
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={["/hyrox-calculator"]}>
        <RaceDetailsPage />
      </MemoryRouter>,
    );
  }

  function fillRequiredRaceDetails() {
    fireEvent.change(screen.getByLabelText(/age group/i), {
      target: { value: "30-34" },
    });
    fireEvent.change(screen.getByLabelText(/^finish time/i), {
      target: { value: "1:32:00" },
    });
  }

  test("default mode is target and requires target finish time", () => {
    renderPage();

    expect(screen.getByRole("button", { name: /hit a target time/i }).className).toMatch(/selected/i);
    fillRequiredRaceDetails();

    expect(screen.getAllByText(/next: check splits/i)[0]).toBeDisabled();
  });

  test("analyse mode only requires age group and finish time", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /analyse my race/i }));
    fillRequiredRaceDetails();

    expect(screen.getAllByText(/next: check splits/i)[0]).not.toBeDisabled();
  });

  test("mode change persists calculatorMode in the draft", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /analyse my race/i }));

    expect(loadDraft()?.calculatorMode).toBe("analyse");
  });

  test("analyse mode with slower optional goal shows warning but keeps Next enabled", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /analyse my race/i }));
    fillRequiredRaceDetails();
    fireEvent.change(screen.getByLabelText(/goal time/i), {
      target: { value: "1:40:00" },
    });

    expect(screen.getByText(/goal time should be faster/i)).toBeInTheDocument();
    expect(screen.getAllByText(/next: check splits/i)[0]).not.toBeDisabled();
  });
});

