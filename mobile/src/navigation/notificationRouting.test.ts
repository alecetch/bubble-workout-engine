import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { navigationRef } from "./navigationRef";
import { navigateFromNotificationResponse } from "./notificationRouting";

vi.mock("./navigationRef", () => ({
  navigationRef: {
    isReady: vi.fn(() => true),
    navigate: vi.fn(),
  },
}));

function makeResponse(data: Record<string, unknown>) {
  return {
    notification: {
      request: {
        content: {
          data,
        },
      },
    },
  } as Parameters<typeof navigateFromNotificationResponse>[0];
}

const isReadyMock = navigationRef.isReady as Mock;
const navigateMock = navigationRef.navigate as Mock;

describe("navigateFromNotificationResponse", () => {
  beforeEach(() => {
    isReadyMock.mockReset();
    isReadyMock.mockReturnValue(true);
    navigateMock.mockReset();
  });

  it("routes PR notifications to history", () => {
    const result = navigateFromNotificationResponse(makeResponse({ event: "pr" }));

    expect(result).toBe(true);
    expect(navigateMock).toHaveBeenCalledWith("HistoryTab", { screen: "HistoryMain" });
  });

  it("routes multi-PR notifications to history", () => {
    const result = navigateFromNotificationResponse(makeResponse({ event: "pr_multi" }));

    expect(result).toBe(true);
    expect(navigateMock).toHaveBeenCalledWith("HistoryTab", { screen: "HistoryMain" });
  });

  it("routes deload notifications to the program day", () => {
    const result = navigateFromNotificationResponse(
      makeResponse({ event: "deload", programDayId: "abc" }),
    );

    expect(result).toBe(true);
    expect(navigateMock).toHaveBeenCalledWith("ProgramsTab", {
      screen: "ProgramDay",
      params: { programDayId: "abc" },
    });
  });

  it("routes reminder notifications to the program day", () => {
    const result = navigateFromNotificationResponse(
      makeResponse({ event: "reminder", programDayId: "abc" }),
    );

    expect(result).toBe(true);
    expect(navigateMock).toHaveBeenCalledWith("ProgramsTab", {
      screen: "ProgramDay",
      params: { programDayId: "abc" },
    });
  });

  it("handles null, not-ready, and no-event responses without navigation", () => {
    expect(navigateFromNotificationResponse(null)).toBe(false);
    expect(navigateMock).not.toHaveBeenCalled();

    isReadyMock.mockReturnValue(false);
    expect(navigateFromNotificationResponse(makeResponse({ event: "pr" }))).toBe(false);
    expect(navigateMock).not.toHaveBeenCalled();

    isReadyMock.mockReturnValue(true);
    expect(navigateFromNotificationResponse(makeResponse({}))).toBe(true);
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
