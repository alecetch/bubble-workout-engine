import { API_BASE_URL } from "./config";

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

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, headers, signal } = options;
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  apiDiagnostics.lastAttemptedUrl = url;

  console.log(`[api] request ${method} ${url}`);

  const requestHeaders: Record<string, string> = {
    Accept: "application/json",
    ...headers,
  };

  if (body !== undefined) {
    requestHeaders["Content-Type"] = requestHeaders["Content-Type"] ?? "application/json";
  }

  // TODO: Inject auth header/token when auth strategy is defined.
  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

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
