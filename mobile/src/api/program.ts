import { ApiError, engineFetch } from "./client";
import { getEngineKeyStatus } from "./config";

export type GenerateProgramPayload = {
  userId: string;
  clientProfileId: string;
  programType: "default";
  anchor_date_ms: number;
};

export type GenerateProgramResponse = {
  program_id?: string;
  programId?: string;
  [key: string]: unknown;
};

function isFallbackEligibleStatus(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 401 || error.status === 403);
}

function stringifyDetails(details: unknown): string {
  if (details == null) return "none";
  if (typeof details === "string") return details;
  try {
    return JSON.stringify(details);
  } catch {
    return "unserializable";
  }
}

function formatUnauthorizedMessage(endpoint: string, status: number, details: unknown): string {
  const keyStatus = getEngineKeyStatus();
  return `Generation unauthorized (${status}) at ${endpoint}. body=${stringifyDetails(details)} Engine key status: hasKey=${keyStatus.hasKey}, source=${keyStatus.source}.`;
}

function toEndpointError(
  endpoint: "/generate-plan-v2" | "/generate-plan" | "/api/program/generate",
  error: unknown,
): Error {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return new Error(`${formatUnauthorizedMessage(endpoint, error.status, error.details)} Last failed endpoint: ${endpoint}.`);
  }

  if (error instanceof ApiError) {
    return new Error(
      `Generation failed (${error.status}) at ${endpoint}. body=${stringifyDetails(error.details)} Last failed endpoint: ${endpoint}.`,
    );
  }

  const baseMessage = error instanceof Error ? error.message : "Generation request failed.";
  return new Error(`${baseMessage} Endpoint: ${endpoint}. Last failed endpoint: ${endpoint}.`);
}

async function generateAtEndpoint(
  endpoint: "/generate-plan-v2" | "/generate-plan" | "/api/program/generate",
  payload: GenerateProgramPayload,
): Promise<GenerateProgramResponse> {
  const body =
    endpoint === "/generate-plan-v2"
      ? {
          dev_user_id: payload.userId,
          dev_client_profile_id: payload.clientProfileId,
          programType: payload.programType,
          anchor_date_ms: payload.anchor_date_ms,
        }
      : endpoint === "/generate-plan"
        ? {
            clientProfileId: payload.clientProfileId,
            bubble_user_id: payload.userId,
            bubble_client_profile_id: payload.clientProfileId,
            programType: payload.programType,
            anchor_date_ms: payload.anchor_date_ms,
          }
        : {
            bubble_user_id: payload.userId,
            bubble_client_profile_id: payload.clientProfileId,
            programType: payload.programType,
            anchor_date_ms: payload.anchor_date_ms,
          };

  return engineFetch<GenerateProgramResponse>(endpoint, {
    method: "POST",
    body,
  });
}

export async function generateProgram(payload: GenerateProgramPayload): Promise<GenerateProgramResponse> {
  const endpointV2: "/generate-plan-v2" = "/generate-plan-v2";
  const endpointLegacy: "/generate-plan" = "/generate-plan";
  const endpointApiFallback: "/api/program/generate" = "/api/program/generate";

  try {
    return await generateAtEndpoint(endpointV2, payload);
  } catch (error) {
    if (!isFallbackEligibleStatus(error)) {
      throw toEndpointError(endpointV2, error);
    }
  }

  try {
    return await generateAtEndpoint(endpointLegacy, payload);
  } catch (error) {
    if (!isFallbackEligibleStatus(error)) {
      throw toEndpointError(endpointLegacy, error);
    }
  }

  try {
    return await generateAtEndpoint(endpointApiFallback, payload);
  } catch (error) {
    throw toEndpointError(endpointApiFallback, error);
  }
}

export function extractProgramId(response: GenerateProgramResponse): string | null {
  const direct = response.program_id ?? response.programId;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }
  return null;
}
