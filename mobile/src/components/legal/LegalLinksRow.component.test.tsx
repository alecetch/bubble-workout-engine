import React from "react";
import { Alert, Linking } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL } from "../../api/config";
import { LegalLinksRow } from "./LegalLinksRow";

const canOpenURLSpy = vi.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
const openURLSpy = vi.spyOn(Linking, "openURL").mockResolvedValue(true);
const alertSpy = vi.spyOn(Alert, "alert").mockImplementation(() => {});

describe("LegalLinksRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canOpenURLSpy.mockResolvedValue(true);
    openURLSpy.mockResolvedValue(true);
  });

  it("renders Terms of Service and Privacy Policy links", () => {
    render(<LegalLinksRow />);

    expect(screen.getByText("Terms of Service")).toBeInTheDocument();
    expect(screen.getByText("Privacy Policy")).toBeInTheDocument();
  });

  it("opens the terms page", async () => {
    render(<LegalLinksRow />);

    fireEvent.click(screen.getByText("Terms of Service"));

    await waitFor(() => expect(openURLSpy).toHaveBeenCalledWith(`${API_BASE_URL}/terms`));
  });

  it("opens the privacy page", async () => {
    render(<LegalLinksRow />);

    fireEvent.click(screen.getByText("Privacy Policy"));

    await waitFor(() => expect(openURLSpy).toHaveBeenCalledWith(`${API_BASE_URL}/privacy`));
  });

  it("shows an alert when the legal URL is unsupported", async () => {
    canOpenURLSpy.mockResolvedValueOnce(false);
    render(<LegalLinksRow />);

    fireEvent.click(screen.getByText("Terms of Service"));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        "Unable to open link",
        "Please try again, or visit the site in your browser.",
      ),
    );
    expect(openURLSpy).not.toHaveBeenCalled();
  });

  it("shows an alert when opening the legal URL fails", async () => {
    openURLSpy.mockRejectedValueOnce(new Error("browser unavailable"));
    render(<LegalLinksRow />);

    fireEvent.click(screen.getByText("Privacy Policy"));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        "Unable to open link",
        "Please try again, or visit the site in your browser.",
      ),
    );
  });
});
