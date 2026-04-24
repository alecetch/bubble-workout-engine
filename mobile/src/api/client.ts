import { API_BASE_URL, ENGINE_KEY } from "./config";
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from "./tokenStorage";

type ApiDiagnostics = {
  lastAttemptedUrl: string | null;
  lastErrorMessage: string | null;
};

const apiDiagnostics: ApiDiagnostics = {
  lastAttemptedUrl: null,
  lastErrorMessage: null,
};

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export function getApiDiagnostics(): ApiDiagnostics {
  return { ...apiDiagnostics };
}

type RequestMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

type RequestOptions = {
  method?: RequestMethod;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

type ApiErrorPayload = {
  code?: string;
  error?: string;
};

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

type InternalRequestOptions = RequestOptions & {
  extraHeaders?: Record<string, string>;
};

async function requestJson<T>(path: string, options: InternalRequestOptions = {}): Promise<T> {
  const { method = "GET", body, headers, signal, extraHeaders } = options;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${API_BASE_URL}${normalizedPath}`;
  apiDiagnostics.lastAttemptedUrl = url;

  console.log(`[api] request ${method} ${url}`);

  const requestHeaders: Record<string, string> = {
    Accept: "application/json",
    ...extraHeaders,
    ...headers,
  };

  if (body !== undefined) {
    if (!(body instanceof FormData)) {
      requestHeaders["Content-Type"] = requestHeaders["Content-Type"] ?? "application/json";
    }
  }

  // TODO: Inject auth header/token when auth strategy is defined.
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body instanceof FormData
        ? (body as unknown as BodyInit)
        : body !== undefined
          ? JSON.stringify(body)
          : undefined,
      signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[api] network failure ${method} ${url}`, message);
    apiDiagnostics.lastErrorMessage = message;
    throw error;
  }

  console.log(`[api] response ${method} ${url} ${response.status}`);

  const data = await parseResponseBody(response);

  if (!response.ok) {
    console.log(`[api] non-2xx body ${method} ${url}`, data);
    const fallbackMessage = `Request failed (${response.status})`;
    const messageFromBody =
      typeof data === "object" && data !== null && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : typeof data === "string"
          ? data
          : fallbackMessage;

    apiDiagnostics.lastErrorMessage = messageFromBody;
    throw new ApiError(response.status, messageFromBody, data);
  }

  apiDiagnostics.lastErrorMessage = null;
  return data as T;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return requestJson<T>(path, options);
}

export async function engineFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!ENGINE_KEY) {
    throw new Error("ENGINE_KEY missing in app runtime. Set EXPO_PUBLIC_ENGINE_KEY for Expo builds.");
  }

  const extraHeaders: Record<string, string> = {
    "X-Engine-Key": ENGINE_KEY,
  };

  return requestJson<T>(path, { ...options, extraHeaders });
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        await clearTokens();
        return null;
      }

      try {
        const refreshed = await apiFetch<{ access_token: string; refresh_token: string }>(
          "/api/auth/refresh",
          {
            method: "POST",
            body: { refresh_token: refreshToken },
          },
        );
        await saveTokens(refreshed.access_token, refreshed.refresh_token);
        return refreshed.access_token;
      } catch {
        await clearTokens();
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
}

function getErrorCode(details: unknown): string | undefined {
  if (!details || typeof details !== "object") return undefined;
  return (details as ApiErrorPayload).code;
}

export async function authenticatedFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new ApiError(401, "Session expired", { code: "session_expired" });
  }

  const makeHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`,
    ...(options.headers ?? {}),
  });

  try {
    return await apiFetch<T>(path, {
      ...options,
      headers: makeHeaders(accessToken),
    });
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    if (apiError?.status !== 401 || getErrorCode(apiError.details) !== "token_expired") {
      throw error;
    }

    const nextAccessToken = await refreshAccessToken();
    if (!nextAccessToken) {
      throw new ApiError(401, "Session expired", { code: "session_expired" });
    }

    try {
      return await apiFetch<T>(path, {
        ...options,
        headers: makeHeaders(nextAccessToken),
      });
    } catch (retryError) {
      const retryApiError = retryError instanceof ApiError ? retryError : null;
      if (retryApiError?.status === 401) {
        await clearTokens();
        throw new ApiError(401, "Session expired", { code: "session_expired" });
      }
      throw retryError;
    }
  }
}

export function engineGetJson<T>(
  path: string,
  options?: Omit<RequestOptions, "method" | "body">,
): Promise<T> {
  return engineFetch<T>(path, { ...options, method: "GET" });
}

export function enginePostJson<TResponse, TBody = unknown>(
  path: string,
  body: TBody,
  options?: Omit<RequestOptions, "method" | "body">,
): Promise<TResponse> {
  return engineFetch<TResponse>(path, { ...options, method: "POST", body });
}

export function enginePatchJson<TResponse, TBody = unknown>(
  path: string,
  body: TBody,
  options?: Omit<RequestOptions, "method" | "body">,
): Promise<TResponse> {
  return engineFetch<TResponse>(path, { ...options, method: "PATCH", body });
}

export function authGetJson<T>(
  path: string,
  options?: Omit<RequestOptions, "method" | "body">,
): Promise<T> {
  return authenticatedFetch<T>(path, { ...options, method: "GET" });
}

export function authPostJson<TResponse, TBody = unknown>(
  path: string,
  body: TBody,
  options?: Omit<RequestOptions, "method" | "body">,
): Promise<TResponse> {
  return authenticatedFetch<TResponse>(path, { ...options, method: "POST", body });
}

export function authPatchJson<TResponse, TBody = unknown>(
  path: string,
  body: TBody,
  options?: Omit<RequestOptions, "method" | "body">,
): Promise<TResponse> {
  return authenticatedFetch<TResponse>(path, { ...options, method: "PATCH", body });
}

export function authDeleteJson<T>(
  path: string,
  options?: Omit<RequestOptions, "method" | "body">,
): Promise<T> {
  return authenticatedFetch<T>(path, { ...options, method: "DELETE" });
}

export async function authPostFormData<T>(
  path: string,
  body: FormData,
  options: Omit<RequestOptions, "method" | "body" | "headers"> = {},
): Promise<T> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new ApiError(401, "Session expired", { code: "session_expired" });
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${API_BASE_URL}${normalizedPath}`;
  apiDiagnostics.lastAttemptedUrl = url;

  console.log(`[api] request POST ${url}`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body,
      signal: options.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[api] network failure POST ${url}`, message);
    apiDiagnostics.lastErrorMessage = message;
    throw error;
  }

  console.log(`[api] response POST ${url} ${response.status}`);
  const data = await parseResponseBody(response);

  if (!response.ok) {
    console.log(`[api] non-2xx body POST ${url}`, data);
    const fallbackMessage = `Request failed (${response.status})`;
    const messageFromBody =
      typeof data === "object" && data !== null && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : typeof data === "string"
          ? data
          : fallbackMessage;

    apiDiagnostics.lastErrorMessage = messageFromBody;
    throw new ApiError(response.status, messageFromBody, data);
  }

  apiDiagnostics.lastErrorMessage = null;
  return data as T;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, headers, signal } = options;
  return apiFetch<T>(path, { method, body, headers, signal });
}

export function getJson<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
  return apiRequest<T>(path, { ...options, method: "GET" });
}

export function postJson<TResponse, TBody = unknown>(
  path: string,
  body: TBody,
  options?: Omit<RequestOptions, "method" | "body">,
): Promise<TResponse> {
  return apiRequest<TResponse>(path, { ...options, method: "POST", body });
}

export function patchJson<TResponse, TBody = unknown>(
  path: string,
  body: TBody,
  options?: Omit<RequestOptions, "method" | "body">,
): Promise<TResponse> {
  return apiRequest<TResponse>(path, { ...options, method: "PATCH", body });
}
