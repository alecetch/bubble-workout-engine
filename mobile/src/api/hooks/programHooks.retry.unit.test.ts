import { describe, expect, it } from "vitest";
import { ApiError, NetworkTimeoutError } from "../client";
import { shouldRetrySegmentSave, segmentSaveRetryDelay } from "./programHooks";

describe("segment save retry policy", () => {
  for (const error of [new NetworkTimeoutError(), new TypeError("fetch failed"), ...[500, 502, 503].map(status => new ApiError(status, "server error"))]) {
    it(`retries ${error.name} ${error instanceof ApiError ? error.status : "network"} twice`, () => {
      expect(shouldRetrySegmentSave(0, error)).toBe(true);
      expect(shouldRetrySegmentSave(1, error)).toBe(true);
      expect(shouldRetrySegmentSave(2, error)).toBe(false);
    });
  }
  for (const status of [400, 401, 402, 403, 404, 408, 429]) {
    it(`never retries ${status}`, () => {
      for (const count of [0, 1, 2]) expect(shouldRetrySegmentSave(count, new ApiError(status, "client error"))).toBe(false);
    });
  }
  it("does not retry unrelated errors and backs off 1s then 3s", () => {
    expect(shouldRetrySegmentSave(0, new Error("other"))).toBe(false);
    expect(segmentSaveRetryDelay(0)).toBe(1000);
    expect(segmentSaveRetryDelay(1)).toBe(3000);
  });
});
