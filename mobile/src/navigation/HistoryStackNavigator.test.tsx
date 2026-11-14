import React from "react";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { HistoryStackNavigator } from "./HistoryStackNavigator";
const flags = vi.hoisted(() => ({ PHYSIQUE_ENABLED: false }));
vi.mock("../config/features", () => flags);
vi.mock("../screens/history/HistoryScreen", () => ({ HistoryScreen: () => null }));
vi.mock("@react-navigation/native-stack", () => ({ createNativeStackNavigator: () => ({
  Navigator: ({ children }: any) => <div>{children}</div>,
  Screen: ({ name }: any) => <span>{name}</span>,
}) }));
const physiqueRoutes = ["PhysiqueCheckIn", "PhysiqueIntelligence", "PhysiqueHistory", "PhysiqueMilestones", "PhysiqueScanDetail"];
it.each([false, true])("registers physique routes only when enabled (%s)", enabled => {
  flags.PHYSIQUE_ENABLED = enabled;
  render(<HistoryStackNavigator />);
  expect(screen.getByText("HistoryMain")).toBeInTheDocument();
  for (const route of physiqueRoutes) expect(Boolean(screen.queryByText(route))).toBe(enabled);
});
