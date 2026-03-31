type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

const STORAGE_KEY = "app:user-id";
const inMemoryStore = new Map<string, string>();
let cachedUserId: string | null = null;
const INVALID_USER_IDS = new Set(["", "undefined", "null"]);

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

function normalizeUserId(value: string | null | undefined): string {
  const normalized = value?.trim() ?? "";
  return INVALID_USER_IDS.has(normalized) ? "" : normalized;
}

export async function getOrCreateUserId(): Promise<string> {
  const normalizedCachedUserId = normalizeUserId(cachedUserId);
  if (normalizedCachedUserId) {
    cachedUserId = normalizedCachedUserId;
    return normalizedCachedUserId;
  }

  const storage = getStorage();
  const stored = normalizeUserId(await storage.getItem(STORAGE_KEY));
  if (stored) {
    cachedUserId = stored;
    return stored;
  }

  const created = createUserId();
  await storage.setItem(STORAGE_KEY, created);
  cachedUserId = created;
  return created;
}

export async function getUserIdentityQueryString(): Promise<string> {
  const userId = await getOrCreateUserId();
  const params = new URLSearchParams();
  params.set("user_id", userId);
  params.set("bubble_user_id", userId);
  return params.toString();
}
