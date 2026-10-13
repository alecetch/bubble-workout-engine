import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HeroHeader } from "./HeroHeader";

// The global Animated.Image stub drops source and onError. Preserve those
// props here so DOM error events exercise the component's fallback behavior.
vi.mock("react-native-reanimated", () => ({
  default: {
    View: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Image: ({ source, onError }: { source: { uri: string }; onError?: () => void }) => (
      <img src={source.uri} onError={onError} />
    ),
  },
  useSharedValue: (value: number) => ({ value }),
  useAnimatedStyle: (fn: () => unknown) => fn(),
  withTiming: (value: number) => value,
  Easing: { out: (easing: unknown) => easing, quad: vi.fn() },
}));

vi.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: any) => <>{children}</>,
}));

const heroMedia = "https://cdn.example.com/hero.jpg";
const textProps = { title: "Strength Block", summary: "Build strength" };

function expectText() {
  expect(screen.getByText(textProps.title)).toBeInTheDocument();
  expect(screen.getByText(textProps.summary)).toBeInTheDocument();
}

describe("HeroHeader", () => {
  it("renders the hero image with the title and summary", () => {
    const { container } = render(<HeroHeader {...textProps} heroMedia={heroMedia} />);
    expect(container.querySelector("img")).toHaveAttribute("src", heroMedia);
    expect(screen.getByTestId("hero-image-tint")).toBeInTheDocument();
    expectText();
  });

  it("renders the title and summary without an image when media is absent", () => {
    const { container } = render(<HeroHeader {...textProps} heroMedia={null} />);
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hero-image-tint")).not.toBeInTheDocument();
    expectText();
  });

  it("falls back to the title and summary when the image fails to load", () => {
    const { container } = render(<HeroHeader {...textProps} heroMedia={heroMedia} />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hero-image-tint")).not.toBeInTheDocument();
    expectText();
  });

  it("attempts the new image when the URL changes after a failure", () => {
    const { container, rerender } = render(<HeroHeader {...textProps} heroMedia={heroMedia} />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).not.toBeInTheDocument();

    const newHeroMedia = "https://cdn.example.com/new-hero.jpg";
    rerender(<HeroHeader {...textProps} heroMedia={newHeroMedia} />);
    expect(container.querySelector("img")).toHaveAttribute("src", newHeroMedia);
    expectText();
  });
});
