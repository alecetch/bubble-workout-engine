import React from "react";
import { axe } from "jest-axe";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WelcomeLoginScreen } from "./WelcomeLoginScreen";

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, disabled, onPress }: any) => (
    <button type="button" aria-label={accessibilityLabel} disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const config = vi.hoisted(() => ({ WELCOME_HERO_URL: "" }));
vi.mock("../../api/config", () => config);
vi.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: any) => <>{children}</>,
}));

function makeNav() {
  return { navigate: vi.fn(), goBack: vi.fn(), replace: vi.fn() };
}

function renderScreen() {
  const navigation = makeNav();
  render(<WelcomeLoginScreen navigation={navigation as any} route={{ params: {} } as any} />);
  return navigation;
}

describe("WelcomeLoginScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.WELCOME_HERO_URL = "";
  });
  it("has no accessibility violations in the default render state", async () => {
    renderScreen();
    await act(async () => {});
    document.body.firstElementChild?.setAttribute("role", "main");
    expect(await axe(document.body)).toHaveNoViolations();
  });


  it("keeps the Welcome title, navigation and legal links usable with a hero", () => {
    config.WELCOME_HERO_URL = "https://cdn.example.com/welcome.jpg";
    const navigation = renderScreen();
    expect(document.querySelector('img[src="https://cdn.example.com/welcome.jpg"]')).toBeInTheDocument();
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText("Terms of Service")).toBeInTheDocument();
    expect(screen.getByText("Privacy Policy")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(navigation.navigate).toHaveBeenNthCalledWith(1, "Login");
    expect(navigation.navigate).toHaveBeenNthCalledWith(2, "Register");
  });

  it("renders no background image when the hero URL is unset", () => {
    renderScreen();
    expect(document.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("Welcome")).toBeInTheDocument();
  });

  it("has no accessibility violations with a decorative hero image", async () => {
    config.WELCOME_HERO_URL = "https://cdn.example.com/welcome.jpg";
    renderScreen();
    await act(async () => {});
    document.body.firstElementChild?.setAttribute("role", "main");
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it("renders Sign in and Create account buttons", () => {
    renderScreen();

    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });

  it("renders pre-auth legal links", () => {
    renderScreen();

    expect(screen.getByText("Terms of Service")).toBeInTheDocument();
    expect(screen.getByText("Privacy Policy")).toBeInTheDocument();
  });

  it("buttons navigate to the correct auth screens", () => {
    const navigation = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(navigation.navigate).toHaveBeenCalledWith("Login");
    expect(navigation.navigate).toHaveBeenCalledWith("Register");
  });
});
