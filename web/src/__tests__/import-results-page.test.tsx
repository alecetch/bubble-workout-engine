import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ImportResultsPage } from "../pages/ImportResultsPage";
import { clearDraft } from "../utils/storage";
import { FULL_PAGE_TEXT } from "./hyrox-results-parser.test";

const PARTIAL_TEXT = FULL_PAGE_TEXT.split("\n").slice(6, 16).join("\n");

describe("ImportResultsPage", () => {
  beforeEach(() => {
    clearDraft();
    vi.restoreAllMocks();
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={["/hyrox-calculator/import"]}>
        <ImportResultsPage />
      </MemoryRouter>,
    );
  }

  test("Paste tab renders", () => {
    renderPage();
    expect(screen.getByTestId("paste-area")).toBeInTheDocument();
    expect(screen.getByTestId("parse-btn")).toBeInTheDocument();
  });

  test("Successful parse shows confirmation", async () => {
    renderPage();
    fireEvent.change(screen.getByTestId("paste-area"), { target: { value: FULL_PAGE_TEXT } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("parse-btn"));
    });
    expect(screen.getByTestId("parse-confirm")).toBeInTheDocument();
  });

  test("Partial parse shows warning", async () => {
    renderPage();
    fireEvent.change(screen.getByTestId("paste-area"), { target: { value: PARTIAL_TEXT } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("parse-btn"));
    });
    expect(screen.getByTestId("parse-warning")).toBeInTheDocument();
    expect(screen.getByText(/Continue anyway/i)).toBeInTheDocument();
  });

  test("Low-confidence parse shows error", async () => {
    renderPage();
    fireEvent.change(screen.getByTestId("paste-area"), { target: { value: "hello world" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("parse-btn"));
    });
    expect(screen.getByTestId("parse-error")).toBeInTheDocument();
  });

  test("URL tab renders", () => {
    renderPage();
    fireEvent.click(screen.getByText("URL"));
    expect(screen.getByTestId("url-input")).toBeInTheDocument();
  });

  test("URL validation rejects non-hyrox URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderPage();
    fireEvent.click(screen.getByText("URL"));
    fireEvent.change(screen.getByTestId("url-input"), { target: { value: "https://google.com" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("fetch-btn"));
    });
    expect(screen.getByTestId("url-error")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
