type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const inMemoryStore = new Map<string, string>();

function getStorage(): AsyncStorageLike {
  const requireFn = (globalThis as { require?: (id: string) => unknown }).require;
  if (!requireFn) {
    return {
      getItem: async (key) => inMemoryStore.get(key) ?? null,
      setItem: async (key, value) => {
        inMemoryStore.set(key, value);
      },
      removeItem: async (key) => {
        inMemoryStore.delete(key);
      },
    };
  }

  try {
    const loaded = requireFn("@react-native-async-storage/async-storage") as {
      default?: Partial<AsyncStorageLike>;
    };
    if (
      typeof loaded?.default?.getItem === "function" &&
      typeof loaded.default.setItem === "function" &&
      typeof loaded.default.removeItem === "function"
    ) {
      return loaded.default as AsyncStorageLike;
    }
  } catch {
    // Fall through to in-memory storage when AsyncStorage isn't installed.
  }

  return {
    getItem: async (key) => inMemoryStore.get(key) ?? null,
    setItem: async (key, value) => {
      inMemoryStore.set(key, value);
    },
    removeItem: async (key) => {
      inMemoryStore.delete(key);
    },
  };
}

export function getAppStorage(): AsyncStorageLike {
  return getStorage();
}
