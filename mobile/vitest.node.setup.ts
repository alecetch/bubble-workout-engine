import { vi } from "vitest";
// Native boundary: node logic tests do not load Expo's native modules.
vi.mock("./src/lib/appVersion", () => ({ getAppVersionInfo: vi.fn(() => ({ platform: "other", version: null, build: null })) }));
