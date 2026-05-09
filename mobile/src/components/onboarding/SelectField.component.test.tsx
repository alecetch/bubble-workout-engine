import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SelectField } from "./SelectField";

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
    Platform: { ...actual.Platform, OS: "android" },
    Modal: ({ visible, children }: any) => (visible ? <div>{children}</div> : null),
  };
});

const options = [
  { label: "45 min", value: "45" },
  { label: "60 min", value: "60" },
];

function renderField(onSelect = vi.fn()) {
  render(
    <SelectField
      label="Duration"
      placeholder="Select duration"
      options={options}
      onSelect={onSelect}
    />,
  );
  return onSelect;
}

describe("SelectField", () => {
  it("shows the placeholder when no value is set", () => {
    renderField();
    expect(screen.getByText("Select duration")).toBeInTheDocument();
  });

  it("shows valueLabel when set", () => {
    render(
      <SelectField
        label="Duration"
        valueLabel="60 min"
        placeholder="Select duration"
        options={options}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("60 min")).toBeInTheDocument();
  });

  it("opens the option list on press", () => {
    renderField();
    fireEvent.click(screen.getByText("Select duration"));
    expect(screen.getByText("45 min")).toBeInTheDocument();
  });

  it("renders all options after opening", () => {
    renderField();
    fireEvent.click(screen.getByText("Select duration"));
    expect(screen.getByText("45 min")).toBeInTheDocument();
    expect(screen.getByText("60 min")).toBeInTheDocument();
  });

  it("calls onSelect with the selected value", () => {
    const onSelect = renderField();
    fireEvent.click(screen.getByText("Select duration"));
    fireEvent.click(screen.getByText("60 min"));
    expect(onSelect).toHaveBeenCalledWith("60");
  });

  it("closes after selection", () => {
    renderField();
    fireEvent.click(screen.getByText("Select duration"));
    fireEvent.click(screen.getByText("45 min"));
    expect(screen.queryByText("60 min")).not.toBeInTheDocument();
  });
});
