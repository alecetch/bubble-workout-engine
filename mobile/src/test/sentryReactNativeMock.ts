import { vi } from "vitest";

export const init = vi.fn();
export const captureException = vi.fn();
export const addBreadcrumb = vi.fn();
export const setUser = vi.fn();
export const wrap = vi.fn((component) => component);
