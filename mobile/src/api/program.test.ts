import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, authenticatedFetch } from "./client";
import { extractProgramId, generateProgram } from "./program";

vi.mock("./client", () => {
  class ApiError extends Error {
    status: number;
    details?: unknown;

    constructor(status: number, message: string, details?: unknown) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.details = details;
    }
  }

  return {
    ApiError,
    authenticatedFetch: vi.fn(),
  };
});

const authenticatedFetchMock = vi.mocked(authenticatedFetch);

const payload = {
  userId: "user-1",
  clientProfileId: "profile-1",
  programType: "default" as const,
  anchor_date_ms: 1735689600000,
};

describe("generateProgram", () => {
  beforeEach(() => {
    authenticatedFetchMock.mockReset();
  });

  it("calls only /generate-plan-v2 with the authenticated fetcher", async () => {
    authenticatedFetchMock.mockResolvedValue({ program_id: "prog-1" });

    const result = await generateProgram(payload);

    expect(authenticatedFetchMock).toHaveBeenCalledTimes(1);
    expect(authenticatedFetchMock).toHaveBeenCalledWith("/generate-plan-v2", {
      method: "POST",
      body: {
        user_id: "user-1",
        client_profile_id: "profile-1",
        programType: "default",
        anchor_date_ms: 1735689600000,
      },
    });
    expect(result).toEqual({ program_id: "prog-1" });
  });

  it("does not retry a legacy endpoint on 401 or 403 - regression guard for the removed fallback chain", async () => {
    authenticatedFetchMock.mockRejectedValue(new ApiError(401, "Unauthorized", { code: "unauthorized" }));

    await expect(generateProgram(payload)).rejects.toThrow(/Generation unauthorized \(401\)/);
    expect(authenticatedFetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces a generation-failed message for a non-auth ApiError", async () => {
    authenticatedFetchMock.mockRejectedValue(new ApiError(500, "boom", { code: "internal_error" }));

    await expect(generateProgram(payload)).rejects.toThrow(/Generation failed \(500\)/);
  });

  it("surfaces a generic message for a non-ApiError failure", async () => {
    authenticatedFetchMock.mockRejectedValue(new Error("network down"));

    await expect(generateProgram(payload)).rejects.toThrow(/network down/);
  });
});

describe("extractProgramId", () => {
  it("prefers program_id over programId", () => {
    expect(extractProgramId({ program_id: "a", programId: "b" })).toBe("a");
  });

  it("falls back to programId when program_id is absent", () => {
    expect(extractProgramId({ programId: "b" })).toBe("b");
  });

  it("returns null when neither is present", () => {
    expect(extractProgramId({})).toBeNull();
  });
});
