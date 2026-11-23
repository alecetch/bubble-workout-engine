import React from "react";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ProgramsStackNavigator } from "./ProgramsStackNavigator";
vi.mock("../screens/paywall/PaywallScreen", () => ({ PaywallScreen: () => null }));
vi.mock("@react-navigation/native-stack", () => ({ createNativeStackNavigator: () => ({
  Navigator: ({ children, initialRouteName }: any) => <div data-testid="programs-stack" data-initial-route={initialRouteName}>{children}</div>,
  Screen: ({ name }: any) => <span>{name}</span>,
}) }));
it("opens the dashboard directly and does not register the retired hub", () => {
  render(<ProgramsStackNavigator />);
  expect(screen.getByTestId("programs-stack")).toHaveAttribute("data-initial-route", "ProgramDashboard");
  expect(screen.getByText("ProgramDashboard")).toBeInTheDocument();
  expect(screen.queryByText("ProgramHub")).not.toBeInTheDocument();
  expect(screen.getByText("ProgramDay")).toBeInTheDocument();
});
