import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EquipmentCategorySection } from "./EquipmentCategorySection";

vi.mock("../interaction/haptics", () => ({
  hapticLight: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress }: any) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native")>();
  return {
    ...actual,
    LayoutAnimation: {
      ...actual.LayoutAnimation,
      configureNext: vi.fn(),
      Presets: { easeInEaseOut: "easeInEaseOut" },
    },
  };
});

const options = [
  { value: "barbell", label: "Barbell" },
  { value: "dumbbells", label: "Dumbbells" },
];

function renderSection(props: Partial<React.ComponentProps<typeof EquipmentCategorySection>> = {}) {
  const onToggleCollapsed = vi.fn();
  const onToggleItem = vi.fn();
  render(
    <EquipmentCategorySection
      category="Free weights"
      options={options}
      selectedValues={[]}
      collapsed={false}
      onToggleCollapsed={onToggleCollapsed}
      onToggleItem={onToggleItem}
      {...props}
    />,
  );
  return { onToggleCollapsed, onToggleItem };
}

describe("EquipmentCategorySection", () => {
  it("renders the category name", () => {
    renderSection();
    expect(screen.getByText("Free weights")).toBeInTheDocument();
  });

  it("renders the selected count in the header", () => {
    renderSection({ selectedValues: [] });
    expect(screen.getByText("0/2 selected")).toBeInTheDocument();
  });

  it("does not render pills when collapsed", () => {
    renderSection({ collapsed: true });
    expect(screen.queryByText("Barbell")).not.toBeInTheDocument();
    expect(screen.queryByText("Dumbbells")).not.toBeInTheDocument();
  });

  it("renders pills when expanded", () => {
    renderSection({ collapsed: false });
    expect(screen.getByText("Barbell")).toBeInTheDocument();
    expect(screen.getByText("Dumbbells")).toBeInTheDocument();
  });

  it("calls onToggleCollapsed when the category header is pressed", () => {
    const { onToggleCollapsed } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: /Free weights/ }));
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleItem when a pill is pressed", async () => {
    const { onToggleItem } = renderSection({ collapsed: false });
    fireEvent.click(screen.getByRole("button", { name: "Barbell" }));
    await waitFor(() => expect(onToggleItem).toHaveBeenCalledWith("barbell"));
  });
});
