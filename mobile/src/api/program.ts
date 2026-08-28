import { ApiError, authenticatedFetch } from "./client";

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

function stringifyDetails(details: unknown): string {
  if (details == null) return "none";
  if (typeof details === "string") return details;
  try {
    return JSON.stringify(details);
  } catch {
    return "unserializable";
  }
}

function toGenerationError(error: unknown): Error {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return new Error(
      `Generation unauthorized (${error.status}) at /generate-plan-v2. body=${stringifyDetails(error.details)} Auth token or subscription entitlement required.`,
    );
  }
  if (error instanceof ApiError) {
    return new Error(
      `Generation failed (${error.status}) at /generate-plan-v2. body=${stringifyDetails(error.details)}`,
    );
  }
  const baseMessage = error instanceof Error ? error.message : "Generation request failed.";
  return new Error(`${baseMessage} Endpoint: /generate-plan-v2.`);
}

export async function generateProgram(payload: GenerateProgramPayload): Promise<GenerateProgramResponse> {
  try {
    return await authenticatedFetch<GenerateProgramResponse>("/generate-plan-v2", {
      method: "POST",
      body: {
        user_id: payload.userId,
        client_profile_id: payload.clientProfileId,
        programType: payload.programType,
        anchor_date_ms: payload.anchor_date_ms,
      },
    });
  } catch (error) {
    throw toGenerationError(error);
  }
}

export function extractProgramId(response: GenerateProgramResponse): string | null {
  const direct = response.program_id ?? response.programId;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }
  return null;
}
