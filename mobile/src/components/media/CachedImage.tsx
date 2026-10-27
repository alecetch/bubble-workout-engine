import React from "react";
import { Image, type ImageContentFit, type ImageStyle } from "expo-image";
import type { StyleProp } from "react-native";

type CachedImageProps = {
  uri: string | null | undefined;
  thumbhash?: string | null;
  style: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  recyclingKey?: string;
  transitionMs?: number;
  onLoad?: () => void;
  onError?: () => void;
  testID?: string;
};

export function CachedImage({
  uri, thumbhash, style, contentFit = "cover", recyclingKey, transitionMs = 200,
  onLoad, onError, testID,
}: CachedImageProps): React.JSX.Element | null {
  if (!uri) return null;
  return (
    <Image
      source={{ uri }}
      cachePolicy="memory-disk"
      placeholder={thumbhash ? { thumbhash } : undefined}
      placeholderContentFit="cover"
      contentFit={contentFit}
      transition={transitionMs}
      recyclingKey={recyclingKey}
      onLoad={onLoad}
      onError={onError}
      style={style}
      testID={testID}
    />
  );
}
