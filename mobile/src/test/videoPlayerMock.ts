import type { Mock } from "vitest";

export type MockVideoPlayer = {
  initialSource: unknown;
  loop: boolean;
  muted: boolean;
  play: Mock<() => void>;
  pause: Mock<() => void>;
  replace: Mock<(source: unknown) => void>;
  replaceAsync: Mock<(source: unknown) => Promise<void>>;
  addListener: Mock<(event: string, listener: (payload: unknown) => void) => { remove: () => void }>;
  /** Test helper: deliver a player event to every registered listener. */
  emit: (event: string, payload: unknown) => void;
};

export const lastVideoPlayer: { current: MockVideoPlayer | null } = { current: null };
