import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform, ToastAndroid, View } from "react-native";
import type { ViewInstance } from "react-native";
import { captureRef, releaseCapture } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { MilestoneShareCard, type MilestoneShareCardProps } from "./MilestoneShareCard";
import { ClubShareCard, type ClubShareCardProps } from "./ClubShareCard";
import { YearHeatmapShareCard, type YearHeatmapShareCardProps } from "./YearHeatmapShareCard";
import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from "./YearShareFrame";

export type ShareCardData = ({ type: "milestone" } & MilestoneShareCardProps)
  | ({ type: "club" } & ClubShareCardProps) | ({ type: "year" } & YearHeatmapShareCardProps);

function notify(message: string) {
  if (Platform.OS === "android") ToastAndroid.show(message, ToastAndroid.LONG);
  else Alert.alert("Share card", message);
}

export function useShareCard() {
  const [card, setCard] = useState<ShareCardData | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const viewRef = useRef<ViewInstance>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const ready = useRef<{ resolve: () => void; reject: (error: Error) => void } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; ready.current?.reject(new Error("Share cancelled")); ready.current = null; };
  }, []);

  const shareCard = useCallback(async (data: ShareCardData): Promise<void> => {
    if (busy.current || !mounted.current) return;
    busy.current = true;
    setIsSharing(true);
    let uri: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!await Sharing.isAvailableAsync()) {
        if (mounted.current) notify("Sharing isn't available on this device.");
        return;
      }
      if (!mounted.current) return;
      const layout = new Promise<void>((resolve, reject) => {
        ready.current = { resolve, reject };
        timer = setTimeout(() => reject(new Error("Share card layout timed out")), 5000);
      });
      setCard(data);
      await layout;
      clearTimeout(timer);
      // Wait for the committed layout and native SVG paint before capturing.
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (!mounted.current) return;
      uri = await captureRef(viewRef, { format: "png", quality: 1, result: "tmpfile", width: 1080, height: 1920 });
      if (!uri) throw new Error("No capture returned");
      if (mounted.current) await Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: "Share your training year" });
    } catch {
      if (mounted.current) notify("Couldn't share this card. Please try again.");
    } finally {
      clearTimeout(timer);
      ready.current = null;
      if (uri) { try { releaseCapture(uri); } catch { /* Temporary-file cleanup is best effort. */ } }
      busy.current = false;
      if (mounted.current) { setCard(null); setIsSharing(false); }
    }
  }, []);

  const content = card?.type === "year" ? React.createElement(YearHeatmapShareCard, card)
    : card?.type === "club" ? React.createElement(ClubShareCard, card)
    : card ? React.createElement(MilestoneShareCard, card) : null;
  const shareView = card ? React.createElement(View, {
    pointerEvents: "none", accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants",
    style: { position: "absolute", left: -10000, top: 0, width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT },
  }, React.createElement(View, { ref: viewRef, collapsable: false, testID: "share-card-canvas",
    onLayout: () => ready.current?.resolve(), style: { width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT } }, content)) : null;
  return { shareCard, isSharing, shareView };
}
