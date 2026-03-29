type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

const STORAGE_KEY = "app:user-id";
const inMemoryStore = new Map<string, string>();
let cachedUserId: string | null = null;

function getStorage(): AsyncStorageLike {
  const requireFn = (globalThis as { require?: (id: string) => unknown }).require;
  if (!requireFn) {
    return {
      getItem: async (key) => inMemoryStore.get(key) ?? null,
      setItem: async (key, value) => {
        inMemoryStore.set(key, value);
      },
    };
  }

  try {
    const loaded = requireFn("@react-native-async-storage/async-storage") as {
      default?: Partial<AsyncStorageLike>;
    };
    if (typeof loaded?.default?.getItem === "function" && typeof loaded.default.setItem === "function") {
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
  };
}

function createUserId(): string {
  const random = Math.random().toString(36).slice(2, 12);
  return `user_${Date.now().toString(36)}_${random}`;
}

export async function getOrCreateUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;

  const storage = getStorage();
  const stored = (await storage.getItem(STORAGE_KEY))?.trim() ?? "";
  if (stored) {
    cachedUserId = stored;
    return stored;
  }

  const created = createUserId();
  await storage.setItem(STORAGE_KEY, created);
  cachedUserId = created;
  return created;
}
