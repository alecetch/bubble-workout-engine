import React from "react";
import { Alert, Linking } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LegalLinksRow } from "./LegalLinksRow";

const canOpenURLSpy = vi.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
const openURLSpy = vi.spyOn(Linking, "openURL").mockResolvedValue(undefined);
const alertSpy = vi.spyOn(Alert, "alert").mockImplementation(() => {});

describe("LegalLinksRow", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    canOpenURLSpy.mockResolvedValue(true);
    openURLSpy.mockResolvedValue(undefined);
  });

  it("renders Terms of Service and Privacy Policy links", () => {
    render(<LegalLinksRow />);

    expect(screen.getByText("Terms of Service")).toBeInTheDocument();
    expect(screen.getByText("Privacy Policy")).toBeInTheDocument();
    expect(screen.queryByText("Help & Support")).not.toBeInTheDocument();
  });

  it("uses a configured website URL without duplicate slashes", async () => {
    vi.stubEnv("EXPO_PUBLIC_WEBSITE_BASE_URL", "http://192.168.1.10:3000///");
    vi.resetModules();
    const { openLegalUrl } = await import("./LegalLinksRow");
    await openLegalUrl("/support");
    expect(openURLSpy).toHaveBeenCalledWith("http://192.168.1.10:3000/support");
  });

  it("opens the terms page", async () => {
    render(<LegalLinksRow />);

    fireEvent.click(screen.getByText("Terms of Service"));

    await waitFor(() => expect(openURLSpy).toHaveBeenCalledWith("https://200days.app/terms"));
  });

  it("opens the privacy page", async () => {
    render(<LegalLinksRow />);

    fireEvent.click(screen.getByText("Privacy Policy"));

    await waitFor(() => expect(openURLSpy).toHaveBeenCalledWith("https://200days.app/privacy"));
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
