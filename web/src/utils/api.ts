import type { HyroxAnalysisRequest, HyroxAnalysisResponse, HyroxPredictionRequest, HyroxPredictionResponse, HyroxSubmissionDraftResponse } from "../types";
import type { HyroxParseResult } from "./hyroxResultsParser";
import { loadDraft } from "./storage";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
const SESSION_ID_KEY = "forma.hyroxSessionId";

export class ValidationError extends Error {
  constructor(
    public readonly errors: Array<{ field: string; message: string }>,
  ) {
    super("validation_failed");
    this.name = "ValidationError";
  }
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

export class ServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerError";
  }
}

export async function submitHyroxAnalysis(
  payload: HyroxAnalysisRequest,
): Promise<HyroxAnalysisResponse> {
  const url = `${BASE_URL}/api/hyrox/analyse`;
  const calculatorMode = payload.calculatorMode ?? loadDraft()?.calculatorMode ?? "target";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, calculatorMode }),
  });

  if (res.status === 400) {
    const body = await res.json();
    throw new ValidationError(body.errors ?? []);
  }
  if (res.status === 429) {
    const body = await res.json();
    throw new RateLimitError(body.message ?? "Too many requests.");
  }
  if (!res.ok) {
    let message = "Something went wrong. Please try again.";
    try {
      const body = await res.json();
      message = body.message ?? message;
    } catch {
      // ignore
    }
    throw new ServerError(message);
  }

  return res.json() as Promise<HyroxAnalysisResponse>;
}

export async function submitHyroxPrediction(
  payload: HyroxPredictionRequest,
): Promise<HyroxPredictionResponse> {
  const url = `${BASE_URL}/api/hyrox/predict`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (res.status === 400) {
    const body = await res.json();
    throw new ValidationError(body.errors ?? []);
  }
  if (res.status === 429) {
    const body = await res.json();
    throw new RateLimitError(body.message ?? "Too many requests.");
  }
  if (!res.ok) {
    let message = "Something went wrong. Please try again.";
    try {
      const body = await res.json();
      message = body.message ?? message;
    } catch {
      // ignore
    }
    throw new ServerError(message);
  }

  return res.json() as Promise<HyroxPredictionResponse>;
}

export interface HyroxDivisionDetection {
  raceFormat: "singles" | "doubles" | "unknown";
  divisionSex: "male" | "female" | "mixed" | "unknown";
  divisionLabel: string;
  eventCode: string | null;
  eventPrefix: string | null;
  sexParam: string | null;
  source: "url_event_param" | "no_event_param" | "invalid_url";
}

export async function fetchHyroxResultsImport(
  url: string,
): Promise<{
  success: boolean;
  reason?: string;
  parsed?: HyroxParseResult;
  divisionDetection?: HyroxDivisionDetection;
  eventDate?: string;
  eventName?: string;
}> {
  try {
    const res = await fetch(`${BASE_URL}/api/hyrox/import-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return { success: false, reason: res.ok ? "invalid_response" : "fetch_failed" };
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      return { success: false, reason: body.error ?? "fetch_failed" };
    }
    return res.json() as Promise<{
      success: boolean;
      reason?: string;
      parsed?: HyroxParseResult;
      divisionDetection?: HyroxDivisionDetection;
      eventDate?: string;
      eventName?: string;
    }>;
  } catch {
    return { success: false, reason: "fetch_failed" };
  }
}

export async function fetchHyroxSubmissionDraft(submissionId: string): Promise<HyroxSubmissionDraftResponse> {
  const res = await fetch(`${BASE_URL}/api/hyrox/submission-draft/${encodeURIComponent(submissionId)}`);
  if (!res.ok) {
    throw new ServerError("Unable to restore this HYROX result.");
  }
  return res.json() as Promise<HyroxSubmissionDraftResponse>;
}

export function trackEvent(name: string, props?: Record<string, unknown>): void {
  const key = import.meta.env.VITE_ANALYTICS_KEY as string | undefined;
  if (!key) return;
  // Fire-and-forget — no blocking
  try {
    void fetch(`https://plausible.io/api/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, url: window.location.href, domain: key, props }),
    });
  } catch {
    // ignore analytics failures
  }
}

export function getHyroxSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

export function trackServerEvent(
  eventName: string,
  { submissionId, metadata }: { submissionId?: string; metadata?: Record<string, unknown> } = {},
): void {
  try {
    void fetch(`${BASE_URL}/api/hyrox/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: getHyroxSessionId(), submissionId, eventName, metadata }),
    }).catch(() => {
      // ignore analytics failures — this must never surface to the caller or the console
    });
  } catch {
    // ignore analytics failures
  }
}
