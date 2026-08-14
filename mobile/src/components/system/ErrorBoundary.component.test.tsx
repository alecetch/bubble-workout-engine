import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Text } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

vi.mock("../interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, onPress }: any) => (
    <button type="button" aria-label={accessibilityLabel} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

vi.mock("../../utils/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

function Bomb(): React.JSX.Element {
  throw new Error("boom");
}

let shouldThrow = true;

function RecoverableBomb(): React.JSX.Element {
  if (shouldThrow) {
    throw new Error("boom");
  }
  return <Text>recovered</Text>;
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

function silenceReactErrorLogs(): void {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
}

afterEach(() => {
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = null;
  shouldThrow = true;
});

describe("ErrorBoundary", () => {
  it("renders children when no error is thrown", () => {
    render(
      <ErrorBoundary>
        <Text>ok</Text>
      </ErrorBoundary>,
    );

    expect(screen.getByText("ok")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  it("catches render errors and shows the fallback UI", () => {
    silenceReactErrorLogs();

    expect(() =>
      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>,
      ),
    ).not.toThrow();

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("calls onError with the thrown error and component stack", () => {
    silenceReactErrorLogs();
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    const [error, componentStack] = onError.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("boom");
    expect(typeof componentStack).toBe("string");
  });

  it("resets the fallback when Try again is pressed", () => {
    silenceReactErrorLogs();

    render(
      <ErrorBoundary>
        <RecoverableBomb />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("recovered")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });
});
