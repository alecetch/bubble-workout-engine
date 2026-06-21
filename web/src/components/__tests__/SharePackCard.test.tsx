import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SharePackCard } from "../SharePackCard";

vi.mock("../../utils/api", () => ({
  trackEvent: vi.fn(),
}));

const packResponse = {
  downloadUrl: "https://example.com/pack.zip",
  shareUrl: "https://example.com/share/token",
  caption: "Caption text",
  slideCount: 6,
};

function mockFetchSuccess() {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/email")) return new Response(JSON.stringify({ sent: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.includes("/qr")) return new Response("<svg></svg>", { status: 200, headers: { "Content-Type": "image/svg+xml" } });
    if (init?.method === "POST") return new Response(JSON.stringify(packResponse), { status: 200, headers: { "Content-Type": "application/json" } });
    return new Response("not found", { status: 404 });
  }));
}

describe("SharePackCard", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  test("shows loading skeleton while API call is in flight", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    render(<SharePackCard submissionId="sub-123" prefillEmail="test@example.com" />);
    expect(screen.getByText(/Preparing your Instagram pack/i)).toBeInTheDocument();
  });

  test("renders download, copy caption, and send to phone actions on success", async () => {
    mockFetchSuccess();
    render(<SharePackCard submissionId="sub-123" prefillEmail="test@example.com" />);

    expect(await screen.findByRole("link", { name: /Download Instagram Pack/i })).toHaveAttribute("href", packResponse.downloadUrl);
    expect(screen.getByRole("button", { name: /Copy caption/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send to phone/i })).toBeInTheDocument();
  });

  test("copy caption button label becomes Copied after click", async () => {
    mockFetchSuccess();
    render(<SharePackCard submissionId="sub-123" />);

    fireEvent.click(await screen.findByRole("button", { name: /Copy caption/i }));
    expect(await screen.findByRole("button", { name: /Copied/i })).toBeInTheDocument();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Caption text");
  });

  test("send to phone expands email input and buttons", async () => {
    mockFetchSuccess();
    render(<SharePackCard submissionId="sub-123" prefillEmail="test@example.com" />);

    fireEvent.click(await screen.findByRole("button", { name: /Send to phone/i }));
    expect(screen.getByLabelText(/Email address for Instagram pack/i)).toHaveValue("test@example.com");
    expect(screen.getByRole("button", { name: /Email me the pack/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show QR code/i })).toBeInTheDocument();
  });

  test("error state shows retry button when initial fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("error", { status: 500 })));
    render(<SharePackCard submissionId="sub-123" />);

    await waitFor(() => expect(screen.getByText(/We couldn't prepare your pack/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
  });
});
