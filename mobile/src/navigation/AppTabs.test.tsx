import { createNotificationResponseQueue } from "./notificationRouting";
import { navigationRef } from "./navigationRef";
import React from "react";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppTabs } from "./AppTabs";

const startupNavigation = vi.hoisted(() => ({ ready: false, navigate: null as null | ((name: string) => void) }));
vi.mock("./navigationRef", () => ({ navigationRef: {
  isReady: vi.fn(() => startupNavigation.ready),
  navigate: vi.fn((name: string) => startupNavigation.navigate?.(name)),
} }));

vi.mock("@react-navigation/bottom-tabs", () => ({
  createBottomTabNavigator: vi.fn(() => {
    const Screen = () => null;
    const Navigator = ({ children, initialRouteName }: { children: React.ReactNode; initialRouteName?: string }) => {
      const [activeTab, setActiveTab] = React.useState(initialRouteName);
      startupNavigation.navigate = setActiveTab;
      const screens = React.Children.toArray(children) as React.ReactElement[];
      const active = screens.find((child) => (child.props as any).name === activeTab) ?? screens[0];
      if (!active) return null;
      const props = active.props as any;
      if (props.name === "TodayTab") return <div data-testid="today-tab">Today</div>;
      if (props.name === "ProgramsTab") return <div data-testid="programs-tab">Programs</div>;
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
  beforeEach(() => { startupNavigation.ready = false; startupNavigation.navigate = null; vi.clearAllMocks(); });
  it("starts onboarded users on Today while retaining ProgramReview as Home's entry", () => {
    render(<AppTabs initialTab="TodayTab" homeInitialRoute="ProgramReview" />);
    expect(screen.getByTestId("today-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("home-tab")).not.toBeInTheDocument();
    act(() => { startupNavigation.navigate?.("HomeTab"); });
    expect(screen.getByTestId("home-tab")).toHaveTextContent("Home: ProgramReview");
  });
  it("does not jump tabs or remount when the initial props change mid-session", () => {
    const { rerender } = render(<AppTabs initialTab="HomeTab" homeInitialRoute="OnboardingEntry" />);
    rerender(<AppTabs initialTab="TodayTab" homeInitialRoute="ProgramReview" />);
    expect(screen.getByTestId("home-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("today-tab")).not.toBeInTheDocument();
  });
  it("flushes a pending reminder to its target after cold start onto Today", () => {
    const queue = createNotificationResponseQueue();
    queue.handle({ notification: { request: { content: { data: { event: "reminder", programDayId: "day-1" } } } } } as any);
    expect(navigationRef.navigate).not.toHaveBeenCalled();
    const { rerender } = render(<AppTabs initialTab="TodayTab" homeInitialRoute="ProgramReview" />);
    expect(screen.getByTestId("today-tab")).toBeInTheDocument();
    startupNavigation.ready = true;
    act(() => queue.flush());
    expect(navigationRef.navigate).toHaveBeenCalledWith("ProgramsTab", { screen: "ProgramDay", params: { programDayId: "day-1" } });
    expect(screen.getByTestId("programs-tab")).toBeInTheDocument();
    rerender(<AppTabs initialTab="TodayTab" homeInitialRoute="ProgramReview" />);
    act(() => queue.flush());
    expect(navigationRef.navigate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("programs-tab")).toBeInTheDocument();
  });
  it("starts on HomeTab when the home initial route is ProgramReview", () => {
    render(<AppTabs initialTab="HomeTab" homeInitialRoute="ProgramReview" />);

    expect(screen.getByTestId("home-tab")).toHaveTextContent("Home: ProgramReview");
    expect(screen.queryByTestId("today-tab")).not.toBeInTheDocument();
  });

  it("starts on HomeTab when the home initial route is OnboardingEntry", () => {
    render(<AppTabs initialTab="HomeTab" homeInitialRoute="OnboardingEntry" />);

    expect(screen.getByTestId("home-tab")).toHaveTextContent("Home: OnboardingEntry");
    expect(screen.queryByTestId("today-tab")).not.toBeInTheDocument();
  });
});
