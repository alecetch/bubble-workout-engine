import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import type React from "react";
import type { View } from "react-native";

export async function captureAndShare(
  viewRef: React.RefObject<View | null>,
): Promise<void> {
  const uri = await captureRef(viewRef, {
    format: "png",
    quality: 1.0,
    result: "tmpfile",
    width: 1080,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) return;

  await Sharing.shareAsync(uri, {
    mimeType: "image/png",
    dialogTitle: "Share your achievement",
    UTI: "public.png",
  });
}
