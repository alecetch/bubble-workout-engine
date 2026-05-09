import { renderHook, act } from "@testing-library/react";
import { useCountdownTimer } from "./useCountdownTimer";

describe("useCountdownTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initialises with displaySeconds equal to initialSeconds and is not running", () => {
    const { result } = renderHook(() => useCountdownTimer({ initialSeconds: 30 }));
    expect(result.current.displaySeconds).toBe(30);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isComplete).toBe(false);
  });

  it("counts down by 1 each second after start()", () => {
    const { result } = renderHook(() => useCountdownTimer({ initialSeconds: 10 }));
    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.displaySeconds).toBe(9);
  });

  it("stops at 0 and marks isComplete when countdown finishes", () => {
    const { result } = renderHook(() => useCountdownTimer({ initialSeconds: 2 }));
    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.displaySeconds).toBe(0);
    expect(result.current.isComplete).toBe(true);
    expect(result.current.isRunning).toBe(false);
  });

  it("counts up when initialSeconds is null", () => {
    const { result } = renderHook(() => useCountdownTimer({ initialSeconds: null }));
    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.displaySeconds).toBe(1);
    expect(result.current.isComplete).toBe(false);
  });

  it("pause stops the counter", () => {
    const { result } = renderHook(() => useCountdownTimer({ initialSeconds: 10 }));
    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const afterOne = result.current.displaySeconds;
    act(() => {
      result.current.pause();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.displaySeconds).toBe(afterOne);
    expect(result.current.isRunning).toBe(false);
  });

  it("reset stops the timer and restores displaySeconds to initialSeconds", () => {
    const { result } = renderHook(() => useCountdownTimer({ initialSeconds: 10 }));
    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.isRunning).toBe(false);
    expect(result.current.displaySeconds).toBe(10);
  });
});
