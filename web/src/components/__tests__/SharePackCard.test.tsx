import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SharePackCard } from "../SharePackCard";
import { trackEvent, trackServerEvent } from "../../utils/api";

vi.mock("../../utils/api", () => ({
  trackEvent: vi.fn(),
  trackServerEvent: vi.fn(),
  getHyroxSessionId: vi.fn(() => "test-session-id"),
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
    vi.clearAllMocks();
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
    expect(trackEvent).toHaveBeenCalledWith("instagram_pack_generated", { submissionId: "sub-123" });
    expect(trackServerEvent).toHaveBeenCalledWith("instagram_pack_generated", { submissionId: "sub-123" });
    expect(screen.getByRole("button", { name: /Copy caption/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send to phone/i })).toBeInTheDocument();
  });

  test("copy caption button label becomes Copied after click", async () => {
    mockFetchSuccess();
    render(<SharePackCard submissionId="sub-123" />);

    fireEvent.click(await screen.findByRole("button", { name: /Copy caption/i }));
    expect(await screen.findByRole("button", { name: /Copied/i })).toBeInTheDocument();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Caption text");
    expect(trackEvent).toHaveBeenCalledWith("instagram_caption_copied", { submissionId: "sub-123" });
    expect(trackServerEvent).toHaveBeenCalledWith("instagram_caption_copied", { submissionId: "sub-123" });
  });

  test("send to phone expands email input and buttons", async () => {
    mockFetchSuccess();
    render(<SharePackCard submissionId="sub-123" prefillEmail="test@example.com" />);

    fireEvent.click(await screen.findByRole("button", { name: /Send to phone/i }));
    expect(screen.getByLabelText(/Email address for Instagram pack/i)).toHaveValue("test@example.com");
    expect(screen.getByRole("button", { name: /Email me the pack/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show QR code/i })).toBeInTheDocument();
  });

  test("dual-fires server events for email, QR, and ZIP download actions", async () => {
    mockFetchSuccess();
    render(<SharePackCard submissionId="sub-123" prefillEmail="test@example.com" />);

    const download = await screen.findByRole("link", { name: /Download Instagram Pack/i });
    fireEvent.click(download);
    expect(trackEvent).toHaveBeenCalledWith("instagram_pack_downloaded", { submissionId: "sub-123" });
    expect(trackServerEvent).toHaveBeenCalledWith("asset_downloaded", { submissionId: "sub-123", metadata: { assetType: "zip" } });

    fireEvent.click(screen.getByRole("button", { name: /Send to phone/i }));
    fireEvent.click(screen.getByRole("button", { name: /Email me the pack/i }));
    await waitFor(() => expect(trackServerEvent).toHaveBeenCalledWith("instagram_pack_email_sent", { submissionId: "sub-123" }));
    expect(trackEvent).toHaveBeenCalledWith("instagram_pack_email_sent", { submissionId: "sub-123" });

    fireEvent.click(screen.getByRole("button", { name: /Show QR code/i }));
    await waitFor(() => expect(trackServerEvent).toHaveBeenCalledWith("instagram_pack_qr_opened", { submissionId: "sub-123" }));
    expect(trackEvent).toHaveBeenCalledWith("instagram_pack_qr_opened", { submissionId: "sub-123" });
  });

  test("sends the hyrox session id in the pack-generation and email request bodies", async () => {
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/email")) return new Response(JSON.stringify({ sent: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      if (init?.method === "POST") return new Response(JSON.stringify(packResponse), { status: 200, headers: { "Content-Type": "application/json" } });
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchSpy);
    render(<SharePackCard submissionId="sub-123" prefillEmail="test@example.com" />);

    await screen.findByRole("link", { name: /Download Instagram Pack/i });
    const generateCall = fetchSpy.mock.calls.find(([url]) => typeof url === "string" && url.endsWith("/share-pack/sub-123"));
    expect(JSON.parse((generateCall?.[1] as RequestInit).body as string)).toMatchObject({ sessionId: "test-session-id" });

    fireEvent.click(screen.getByRole("button", { name: /Send to phone/i }));
    fireEvent.click(screen.getByRole("button", { name: /Email me the pack/i }));
    await waitFor(() => {
      const emailCall = fetchSpy.mock.calls.find(([url]) => typeof url === "string" && url.includes("/email"));
      expect(emailCall).toBeTruthy();
      expect(JSON.parse((emailCall![1] as RequestInit).body as string)).toMatchObject({ sessionId: "test-session-id" });
    });
  });

  test("error state shows retry button when initial fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("error", { status: 500 })));
    render(<SharePackCard submissionId="sub-123" />);

    await waitFor(() => expect(screen.getByText(/We couldn't prepare your pack/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
  });
});
