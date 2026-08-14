import { afterEach, describe, expect, it, vi } from "vitest";

const ASYNC_STORAGE_MODULE = "@react-native-async-storage/async-storage";

type AsyncStorageMock = {
  getItem?: unknown;
  setItem?: unknown;
  removeItem?: unknown;
};

async function loadPersistentStorage(
  asyncStorageMock: AsyncStorageMock,
  vitestEnv: string,
) {
  vi.resetModules();
  vi.doMock(ASYNC_STORAGE_MODULE, () => ({ default: asyncStorageMock }));
  vi.stubEnv("VITEST", vitestEnv);
  return import("./persistentStorage");
}

afterEach(() => {
  vi.doUnmock(ASYNC_STORAGE_MODULE);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getPersistentStorage", () => {
  it("uses in-memory storage under Vitest regardless of AsyncStorage mock state", async () => {
    const { _resetForTest, getPersistentStorage } = await loadPersistentStorage(
      { getItem: undefined, setItem: undefined, removeItem: undefined },
      "true",
    );
    _resetForTest();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const storage = getPersistentStorage();
    await storage.setItem("test:key", "value");

    await expect(storage.getItem("test:key")).resolves.toBe("value");
    expect(warnSpy).not.toHaveBeenCalled();
  }, 10000);

  it("round-trips set, get, and remove in memory", async () => {
    const { _resetForTest, getPersistentStorage } = await loadPersistentStorage({}, "true");
    _resetForTest();

    const storage = getPersistentStorage();
    await storage.setItem("roundtrip:key", "stored");
    await expect(storage.getItem("roundtrip:key")).resolves.toBe("stored");

    await storage.removeItem("roundtrip:key");

    await expect(storage.getItem("roundtrip:key")).resolves.toBeNull();
  });

  it("warns once when AsyncStorage is unavailable outside Vitest", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { getPersistentStorage } = await loadPersistentStorage(
      { getItem: undefined, setItem: undefined, removeItem: undefined },
      "",
    );

    getPersistentStorage();
    getPersistentStorage();

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("resets in-memory values and the fallback warning guard", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { _resetForTest, getPersistentStorage } = await loadPersistentStorage(
      { getItem: undefined, setItem: undefined, removeItem: undefined },
      "",
    );

    const storage = getPersistentStorage();
    await storage.setItem("reset:key", "value");
    expect(warnSpy).toHaveBeenCalledTimes(1);

    _resetForTest();

    const resetStorage = getPersistentStorage();
    await expect(resetStorage.getItem("reset:key")).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});
