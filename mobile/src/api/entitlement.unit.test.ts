import { describe, expect, it, vi } from "vitest";
vi.mock("./client", () => ({
  authGetJson: vi.fn(), authPostJson: vi.fn(),
  ApiError: class ApiError extends Error { constructor(public status: number, message: string) { super(message); } },
}));
import { ApiError, authPostJson } from "./client";
import { syncEntitlement } from "./entitlement";

describe("syncEntitlement", () => {
  it("posts to the authenticated self-sync endpoint", async () => {
    const result = { ok: true, is_active: true, is_premium: true };
    vi.mocked(authPostJson).mockResolvedValueOnce(result);
    expect(await syncEntitlement()).toEqual(result);
    expect(authPostJson).toHaveBeenCalledWith("/api/users/me/entitlement/sync", {});
  });
  it.each([404, 503])("returns null for an unavailable endpoint (%s)", async status => {
    vi.mocked(authPostJson).mockRejectedValueOnce(new ApiError(status, "unavailable"));
    expect(await syncEntitlement()).toBeNull();
  });
  it.each([401, 500, 502])("rethrows other failures (%s)", async status => {
    const error = new ApiError(status, "failed");
    vi.mocked(authPostJson).mockRejectedValueOnce(error);
    await expect(syncEntitlement()).rejects.toBe(error);
  });
});
