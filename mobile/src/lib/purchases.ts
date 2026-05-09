import Constants from "expo-constants";

type PurchasesModule = {
  default?: {
    configure: (options: { apiKey: string }) => Promise<void> | void;
    logIn: (userId: string) => Promise<unknown>;
    logOut: () => Promise<unknown>;
    getOfferings: () => Promise<any>;
    purchasePackage: (pkg: unknown) => Promise<unknown>;
    restorePurchases: () => Promise<any>;
    setLogLevel?: (level: unknown) => void;
  };
  LOG_LEVEL?: {
    ERROR?: unknown;
  };
  PURCHASES_ERROR_CODE?: {
    PURCHASE_CANCELLED_ERROR?: unknown;
  };
};

let cachedModule: PurchasesModule | null | undefined;
let purchasesConfigured = false;

function canUsePurchasesNative(): boolean {
  return Constants.executionEnvironment !== "storeClient";
}

function loadPurchasesModule(): PurchasesModule | null {
  if (cachedModule !== undefined) return cachedModule ?? null;
  if (!canUsePurchasesNative()) {
    cachedModule = null;
    return null;
  }

  try {
    const dynamicRequire = eval("require") as (id: string) => PurchasesModule;
    cachedModule = dynamicRequire("react-native-purchases");
    return cachedModule ?? null;
  } catch {
    cachedModule = null;
    return null;
  }
}

function getPurchasesApi() {
  return loadPurchasesModule()?.default ?? null;
}

export function isPurchasesAvailable(): boolean {
  return getPurchasesApi() != null;
}

export function configurePurchases(apiKey: string): void {
  const mod = loadPurchasesModule();
  const purchases = mod?.default;
  if (!purchases || !apiKey) {
    purchasesConfigured = false;
    return;
  }
  try {
    const errorLevel = mod?.LOG_LEVEL?.ERROR;
    if (errorLevel !== undefined && typeof purchases.setLogLevel === "function") {
      purchases.setLogLevel(errorLevel);
    }
    const result = purchases.configure({ apiKey });
    purchasesConfigured = true;
    if (result && typeof (result as Promise<unknown>).catch === "function") {
      void (result as Promise<unknown>).catch(() => {
        purchasesConfigured = false;
      });
    }
  } catch {
    purchasesConfigured = false;
    // Never block app startup if the native purchases module is unavailable.
  }
}

export function logInPurchases(userId: string): void {
  const purchases = getPurchasesApi();
  if (!purchases || !userId || !purchasesConfigured) return;
  try {
    const result = purchases.logIn(userId);
    if (result && typeof result.catch === "function") {
      void result.catch(() => {
        // Ignore async purchase SDK login failures in unsupported runtimes.
      });
    }
  } catch {
    // Ignore purchase SDK login failures in unsupported runtimes.
  }
}

export function logOutPurchases(): void {
  const purchases = getPurchasesApi();
  if (!purchases || !purchasesConfigured) return;
  try {
    const result = purchases.logOut();
    if (result && typeof result.catch === "function") {
      void result.catch(() => {
        // Ignore async purchase SDK logout failures in unsupported runtimes.
      });
    }
  } catch {
    // Ignore purchase SDK logout failures in unsupported runtimes.
  }
}

export async function getPurchaseOfferings(): Promise<any | null> {
  const purchases = getPurchasesApi();
  if (!purchases) return null;
  return purchases.getOfferings();
}

export async function purchasePackage(pkg: unknown): Promise<void> {
  const purchases = getPurchasesApi();
  if (!purchases) {
    throw new Error("Purchases unavailable");
  }
  await purchases.purchasePackage(pkg);
}

export async function restorePurchases(): Promise<any> {
  const purchases = getPurchasesApi();
  if (!purchases) {
    throw new Error("Purchases unavailable");
  }
  return purchases.restorePurchases();
}

export function isPurchaseCancelledError(err: unknown): boolean {
  const code = loadPurchasesModule()?.PURCHASES_ERROR_CODE?.PURCHASE_CANCELLED_ERROR;
  return Boolean(
    code !== undefined &&
    err &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: unknown }).code === code,
  );
}
