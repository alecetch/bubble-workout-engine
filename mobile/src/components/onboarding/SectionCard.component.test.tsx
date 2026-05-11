import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionCard } from "./SectionCard";

describe("SectionCard", () => {
  it("renders a title when provided", () => {
    render(
      <SectionCard title="Training goals">
        <Text>Body</Text>
      </SectionCard>,
    );
    expect(screen.getByText("Training goals")).toBeInTheDocument();
  });

  it("renders a subtitle when provided", () => {
    render(
      <SectionCard subtitle="Choose what matters most">
        <Text>Body</Text>
      </SectionCard>,
    );
    expect(screen.getByText("Choose what matters most")).toBeInTheDocument();
  });

  it("renders children", () => {
    render(
      <SectionCard>
        <Text>Inner content</Text>
      </SectionCard>,
    );
    expect(screen.getByText("Inner content")).toBeInTheDocument();
  });

  it("renders without title or subtitle", () => {
    expect(() =>
      render(
        <SectionCard>
          <Text>Body</Text>
        </SectionCard>,
      ),
    ).not.toThrow();
  });
});
