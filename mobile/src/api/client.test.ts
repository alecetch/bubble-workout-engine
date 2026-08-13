import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./config", () => ({
  API_BASE_URL: "http://localhost:3000",
  ENGINE_KEY: "",
}));

vi.mock("./tokenStorage", () => ({
  clearTokens: vi.fn(),
  getAccessToken: vi.fn(),
  getRefreshToken: vi.fn(),
  saveTokens: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("api client logging", () => {
  it("does not pass parsed non-2xx response bodies to the logger", async () => {
    const { ApiError, apiFetch } = await import("./client");
    vi.stubGlobal("__DEV__", true);
    const responseBody = { error: "private failure", access_token: "secret-token" };
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(responseBody), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(apiFetch("/body-test")).rejects.toBeInstanceOf(ApiError);

    expect(logSpy).toHaveBeenCalledWith(
      "[api]",
      "non-2xx response GET http://localhost:3000/body-test status=500",
    );
    expect(logSpy.mock.calls.flat()).not.toContainEqual(responseBody);
  });
});
