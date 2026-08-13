import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger } from "./logger";

export type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const inMemoryStore = new Map<string, string>();

let warnedUnavailable = false;

const inMemoryStorage: StorageLike = {
  getItem: async (key) => inMemoryStore.get(key) ?? null,
  setItem: async (key, value) => {
    inMemoryStore.set(key, value);
  },
  removeItem: async (key) => {
    inMemoryStore.delete(key);
  },
};

function hasStorageMethods(storage: Partial<StorageLike> | null | undefined): storage is StorageLike {
  return (
    typeof storage?.getItem === "function" &&
    typeof storage.setItem === "function" &&
    typeof storage.removeItem === "function"
  );
}

function shouldUseTestStorage(): boolean {
  return process.env.VITEST === "true";
}

export function getPersistentStorage(): StorageLike {
  if (shouldUseTestStorage()) {
    return inMemoryStorage;
  }

  if (hasStorageMethods(AsyncStorage)) {
    return AsyncStorage;
  }

  if (!warnedUnavailable) {
    logger.warn(
      "storage",
      "AsyncStorage native module is unavailable; using in-memory storage fallback for this session.",
    );
    warnedUnavailable = true;
  }

  return inMemoryStorage;
}

export function _resetForTest(): void {
  inMemoryStore.clear();
  warnedUnavailable = false;
}
