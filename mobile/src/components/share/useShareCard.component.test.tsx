import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { Alert } from "react-native";
import { captureRef, releaseCapture } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useShareCard } from "./useShareCard";

const data = { type: "milestone", count: 100, year: 2026 } as const;
beforeEach(() => {
  vi.mocked(captureRef).mockReset().mockResolvedValue("/tmp/card.png");
  vi.mocked(releaseCapture).mockClear();
  vi.mocked(Sharing.isAvailableAsync).mockReset().mockResolvedValue(true);
  vi.mocked(Sharing.shareAsync).mockReset().mockResolvedValue(undefined);
  vi.spyOn(Alert, "alert").mockImplementation(() => {});
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function layout(view: React.ReactElement | null) {
  const canvas = (view!.props as { children: React.ReactElement<{ onLayout: () => void }> }).children;
  canvas.props.onLayout();
}
async function begin() {
  const hook = renderHook(() => useShareCard());
  let operation!: Promise<void>;
  await act(async () => { operation = hook.result.current.shareCard(data); });
  return { ...hook, operation };
}
it("mounts before capture, exports exactly 1080x1920, shares and cleans up", async () => {
  const hook = await begin();
  expect(hook.result.current.shareView).not.toBeNull();
  expect(captureRef).not.toHaveBeenCalled();
  await act(async () => { layout(hook.result.current.shareView); await hook.operation; });
  expect(captureRef).toHaveBeenCalledWith(expect.any(Object), { format: "png", quality: 1, result: "tmpfile", width: 1080, height: 1920 });
  expect(Sharing.shareAsync).toHaveBeenCalledWith("/tmp/card.png", expect.objectContaining({ mimeType: "image/png", UTI: "public.png" }));
  expect(releaseCapture).toHaveBeenCalledWith("/tmp/card.png");
  expect(hook.result.current.shareView).toBeNull();
  expect(hook.result.current.isSharing).toBe(false);
});
it("reports unsupported sharing without capturing or throwing", async () => {
  vi.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);
  const hook = renderHook(() => useShareCard());
  await act(async () => { await hook.result.current.shareCard(data); });
  expect(Alert.alert).toHaveBeenCalledWith("Share card", "Sharing isn't available on this device.");
  expect(captureRef).not.toHaveBeenCalled();
  expect(hook.result.current.shareView).toBeNull();
});
it("reports capture errors and resets for a retry", async () => {
  vi.mocked(captureRef).mockRejectedValueOnce(new Error("Capture failed"));
  const hook = await begin();
  await act(async () => { layout(hook.result.current.shareView); await hook.operation; });
  expect(Alert.alert).toHaveBeenCalledWith("Share card", "Couldn't share this card. Please try again.");
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
  expect(hook.result.current.isSharing).toBe(false);
  let retry!: Promise<void>;
  await act(async () => { retry = hook.result.current.shareCard(data); });
  await act(async () => { layout(hook.result.current.shareView); await retry; });
  expect(Sharing.shareAsync).toHaveBeenCalledOnce();
});
it("cleans up a captured file even if sharing fails", async () => {
  vi.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error("Share failed"));
  const hook = await begin();
  await act(async () => { layout(hook.result.current.shareView); await hook.operation; });
  expect(releaseCapture).toHaveBeenCalledWith("/tmp/card.png");
  expect(Alert.alert).toHaveBeenCalledOnce();
});
it("prevents duplicate sharing while the native share sheet is open", async () => {
  let finish!: () => void;
  vi.mocked(Sharing.shareAsync).mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  const hook = await begin();
  await act(async () => { layout(hook.result.current.shareView); });
  await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledOnce());
  await act(async () => { await hook.result.current.shareCard(data); });
  expect(captureRef).toHaveBeenCalledOnce();
  expect(hook.result.current.isSharing).toBe(true);
  await act(async () => { finish(); await hook.operation; });
  expect(hook.result.current.isSharing).toBe(false);
});
it("cancels a pending layout on unmount without capture or alerts", async () => {
  const hook = await begin();
  hook.unmount();
  await hook.operation;
  expect(captureRef).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
});
it("reports a layout timeout instead of waiting indefinitely", async () => {
  vi.useFakeTimers();
  const hook = await begin();
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); await hook.operation; });
  expect(Alert.alert).toHaveBeenCalledOnce();
  expect(hook.result.current.isSharing).toBe(false);
});
