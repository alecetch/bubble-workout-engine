import type { Mock } from "vitest";

export type MockVideoPlayer = {
  initialSource: unknown;
  loop: boolean;
  muted: boolean;
  play: Mock<() => void>;
  pause: Mock<() => void>;
  replace: Mock<(source: unknown) => void>;
  replaceAsync: Mock<(source: unknown) => Promise<void>>;
};

export const lastVideoPlayer: { current: MockVideoPlayer | null } = { current: null };
