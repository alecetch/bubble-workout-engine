import type { MockedFunction } from "vitest";

export function mockZustandSelector<TState>(
  mockFn: MockedFunction<(selector: (s: TState) => unknown) => unknown>,
  state: TState,
): void {
  mockFn.mockImplementation(function (selector) { return selector(state); });
  (mockFn as unknown as { getState: () => TState }).getState = vi.fn(function () { return state; });
}
