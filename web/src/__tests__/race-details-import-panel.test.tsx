import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RaceDetailsPage } from "../pages/RaceDetailsPage";
import { clearDraft, loadDraft } from "../utils/storage";
import { fetchHyroxResultsImport } from "../utils/api";
import { FULL_PAGE_TEXT } from "./hyrox-results-parser.test";

vi.mock("../utils/api", () => ({
  fetchHyroxResultsImport: vi.fn(),
  trackEvent: vi.fn(),
}));

describe("RaceDetailsPage inline import panel", () => {
  beforeEach(() => {
    clearDraft();
    vi.clearAllMocks();
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={["/hyrox-calculator"]}>
        <RaceDetailsPage />
      </MemoryRouter>,
    );
  }

  test("Import panel renders inside Screen 1", () => {
    renderPage();
    expect(screen.getByTestId("inline-import-panel")).toBeInTheDocument();
    expect(screen.getByTestId("paste-area")).toBeInTheDocument();
  });

  test("Or enter manually separator is visible before import", () => {
    renderPage();
    expect(screen.getByTestId("manual-entry-separator")).toBeInTheDocument();
  });

  test("Successful paste import pre-fills fields and hides separator", async () => {
    renderPage();

    fireEvent.change(screen.getByTestId("paste-area"), { target: { value: FULL_PAGE_TEXT } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("parse-btn"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-btn"));
    });

    expect(screen.getByTestId("import-success-badge")).toBeInTheDocument();
    expect(screen.queryByTestId("manual-entry-separator")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/finish time/i)).toHaveValue("1:35:38");
    expect(loadDraft()?.splits?.length).toBeGreaterThan(0);
  });

  test("URL tab renders on Screen 1", () => {
    renderPage();
    fireEvent.click(screen.getByText("URL"));
    expect(screen.getByTestId("inline-url-input")).toBeInTheDocument();
  });

  test("URL tab rejects non-HYROX URLs", async () => {
    renderPage();
    fireEvent.click(screen.getByText("URL"));
    fireEvent.change(screen.getByTestId("inline-url-input"), { target: { value: "https://google.com" } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("inline-url-fetch"));
    });

    expect(screen.getByTestId("inline-url-error")).toBeInTheDocument();
    expect(fetchHyroxResultsImport).not.toHaveBeenCalled();
  });
});
