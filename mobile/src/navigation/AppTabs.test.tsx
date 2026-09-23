import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppTabs } from "./AppTabs";

vi.mock("@react-navigation/bottom-tabs", () => ({
  createBottomTabNavigator: vi.fn(() => {
    const Screen = () => null;
    const Navigator = ({ children, initialRouteName }: { children: React.ReactNode; initialRouteName?: string }) => {
      const screens = React.Children.toArray(children) as React.ReactElement[];
      const active = screens.find((child) => (child.props as any).name === initialRouteName) ?? screens[0];
      if (!active) return null;
      const props = active.props as any;
      if (props.name === "TodayTab") return <div data-testid="today-tab">Today</div>;
      const Component = props.component;
      if (Component) return <Component />;
      if (typeof props.children === "function") return props.children();
      return props.children ?? null;
    };
    return { Navigator, Screen };
  }),
}));

vi.mock("./OnboardingNavigator", () => ({
  OnboardingNavigator: ({ initialRouteName }: { initialRouteName: string }) => (
    <div data-testid="home-tab">Home: {initialRouteName}</div>
  ),
}));

vi.mock("../screens/today/TodayScreen", () => ({
  TodayScreen: () => <div data-testid="today-tab">Today</div>,
}));

vi.mock("./ProgramsStackNavigator", () => ({
  ProgramsStackNavigator: () => <div data-testid="programs-tab">Programs</div>,
}));

vi.mock("./HistoryStackNavigator", () => ({
  HistoryStackNavigator: () => <div data-testid="history-tab">History</div>,
}));

vi.mock("./SettingsStackNavigator", () => ({
  SettingsStackNavigator: () => <div data-testid="settings-tab">Settings</div>,
}));

describe("AppTabs", () => {
  it("starts on TodayTab when the home initial route is ProgramReview", () => {
    render(<AppTabs homeInitialRoute="ProgramReview" />);

    expect(screen.getByTestId("today-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("home-tab")).not.toBeInTheDocument();
  });

  it("starts on HomeTab when the home initial route is OnboardingEntry", () => {
    render(<AppTabs homeInitialRoute="OnboardingEntry" />);

    expect(screen.getByTestId("home-tab")).toHaveTextContent("Home: OnboardingEntry");
    expect(screen.queryByTestId("today-tab")).not.toBeInTheDocument();
  });
});
