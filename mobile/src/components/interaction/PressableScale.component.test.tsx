import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { PressableScale } from "./PressableScale";
import { usePressScale } from "./usePressScale";

vi.mock("react-native", async () => {
  const actual = await vi.importActual<typeof import("react-native")>("react-native");
  const ReactActual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    Pressable: ({
      accessibilityLabel,
      children,
      disabled,
      onLongPress,
      onPress,
      onPressIn,
      onPressOut,
      testID,
    }: any) =>
      ReactActual.createElement(
        "button",
        {
          "aria-label": accessibilityLabel,
          "data-testid": testID,
          disabled,
          onClick: () => onPress?.({} as any),
          onMouseDown: () => {
            onPressIn?.({} as any);
            onLongPress?.({} as any);
          },
          onMouseUp: () => onPressOut?.({} as any),
          type: "button",
        },
        children,
      ),
  };
});

vi.mock("./usePressScale", () => ({
  usePressScale: vi.fn(),
}));

const usePressScaleMock = vi.mocked(usePressScale);

describe("PressableScale", () => {
  const onPressIn = vi.fn();
  const onPressOut = vi.fn();

  beforeEach(() => {
    vi.useRealTimers();
    onPressIn.mockReset();
    onPressOut.mockReset();
    usePressScaleMock.mockReturnValue({
      animatedStyle: { transform: [{ scale: 1 }] } as unknown as ReturnType<typeof usePressScale>["animatedStyle"],
      onPressIn,
      onPressOut,
      reduceMotionEnabled: false,
    });
  });

  it("renders children and fires onPress", () => {
    const onPress = vi.fn();
    render(
      <PressableScale onPress={onPress}>
        <span>Tap me</span>
      </PressableScale>,
    );

    fireEvent.click(screen.getByText("Tap me"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("wires the pressed-state handlers from usePressScale", () => {
    render(
      <PressableScale onPress={vi.fn()}>
        <span>Tap me</span>
      </PressableScale>,
    );

    fireEvent.mouseDown(screen.getByText("Tap me"));
    expect(onPressIn).toHaveBeenCalledTimes(1);

    fireEvent.mouseUp(screen.getByText("Tap me"));
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });

  it("passes disabled through to usePressScale and to the underlying Pressable", () => {
    const onPress = vi.fn();
    render(
      <PressableScale onPress={onPress} disabled>
        <span>Tap me</span>
      </PressableScale>,
    );

    expect(usePressScaleMock).toHaveBeenCalledWith({ disabled: true });
    fireEvent.click(screen.getByText("Tap me"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("still supports onLongPress, accessibilityLabel, and testID", () => {
    const onLongPress = vi.fn();
    vi.useFakeTimers();
    render(
      <PressableScale onLongPress={onLongPress} accessibilityLabel="Do the thing" testID="my-button">
        <span>Tap me</span>
      </PressableScale>,
    );

    expect(screen.getByTestId("my-button")).toHaveAttribute("aria-label", "Do the thing");
    fireEvent.mouseDown(screen.getByTestId("my-button"));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
